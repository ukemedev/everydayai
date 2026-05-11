import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { MASTER_CONTEXT } from "../lib/masterContext.js";
import {
  getRepoFiles,
  getFileContent,
  detectFilePaths,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
  mergePullRequest,
} from "../lib/github.js";
import { runHealthCheck, getLastHealthResult } from "../lib/errorMonitor.js";
import { generateWeeklyReport, sendWeeklyReportTelegram } from "../lib/weeklyReport.js";
import { saveMessage, searchMemory, getLessons } from "../lib/devbotMemory.js";
import { buildContext } from "../lib/devbotSession.js";
import { runTest } from "../lib/devbotTester.js";
import { getEndpointForFile } from "../lib/devbotEndpointMap.js";
import {
  saveSnapshot,
  getSnapshots,
  getSnapshotById,
  getAllSnapshots,
} from "../lib/devbotRollback.js";
import { runCommand, getTerminalLogs } from "../lib/devbotTerminal.js";
import { captureError, getErrors, markResolved } from "../lib/devbotErrorCapture.js";
import { runFullScan } from "../lib/devbotScanner.js";
import { getSchema, runQuery, getTableStats } from "../lib/devbotDatabase.js";
import { createQueue, getQueue, processQueue } from "../lib/devbotTaskQueue.js";

const router = Router();

// ── Supabase admin check ──────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();

  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return false;
  }

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.is_admin !== true) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// ── GitHub available? ─────────────────────────────────────────────────────────

function githubConfigured(): boolean {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

// ── In-memory file tree cache (refreshed every 10 min) ───────────────────────

interface CachedTree {
  files: Array<{ path: string; type: string; size?: number }>;
  fetchedAt: number;
}

let treeCache: CachedTree | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getCachedFiles() {
  if (treeCache && Date.now() - treeCache.fetchedAt < CACHE_TTL_MS) {
    return treeCache.files;
  }
  const files = await getRepoFiles();
  treeCache = { files, fetchedAt: Date.now() };
  return files;
}

// ── File content helpers ──────────────────────────────────────────────────────

const MAX_FILES_IN_CONTEXT = 6;
const MAX_CONTENT_CHARS = 8000;

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content;
  return (
    content.slice(0, MAX_CONTENT_CHARS) +
    `\n\n... [truncated — ${Math.round(content.length / 1024)}KB total, showing first ${Math.round(MAX_CONTENT_CHARS / 1024)}KB]`
  );
}

async function buildFileContext(filePaths: string[]): Promise<string> {
  if (filePaths.length === 0) return "";

  const unique = [...new Set(filePaths)].slice(0, MAX_FILES_IN_CONTEXT);

  const sections = await Promise.all(
    unique.map(async (path) => {
      try {
        const content = await getFileContent(path);
        if (!content) return null;
        const truncated = truncateContent(content);
        const ext = path.split(".").pop() ?? "";
        return `\`\`\`${ext}\n// File: ${path}\n${truncated}\n\`\`\``;
      } catch {
        return null;
      }
    })
  );

  const valid = sections.filter((s): s is string => s !== null);
  if (valid.length === 0) return "";

  return (
    "\n\n════════════════════════════════════════\n" +
    "LOADED FILE CONTENTS (current from repo)\n" +
    "════════════════════════════════════════\n\n" +
    valid.join("\n\n")
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface DevBotBody {
  message?: string;
  history?: HistoryMessage[];
  loadedFiles?: string[];
  sessionId?: string;
  imageData?: string;
  imageMediaType?: string;
}

interface WriteBody {
  path?: string;
  content?: string;
  message?: string;
  branch?: string;
  sessionId?: string;
}

interface DeployBody {
  branch?: string;
  title?: string;
}

// ── GET /api/devbot/files ─────────────────────────────────────────────────────

router.get("/devbot/files", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  if (!githubConfigured()) {
    res.json({ files: [], githubConfigured: false });
    return;
  }

  try {
    const files = await getCachedFiles();
    req.log.info({ count: files.length }, "devbot file tree fetched");
    res.json({ files, githubConfigured: true });
  } catch (err) {
    req.log.error({ err }, "devbot file tree fetch failed");
    res.status(500).json({ error: "Failed to fetch file tree from GitHub" });
  }
});

// ── GET /api/devbot/file?path=... ─────────────────────────────────────────────

router.get("/devbot/file", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  if (!githubConfigured()) {
    res.status(503).json({ error: "GitHub not configured" });
    return;
  }

  const filePath = (req.query["path"] as string | undefined)?.trim();
  if (!filePath) {
    res.status(400).json({ error: "path query parameter is required" });
    return;
  }

  try {
    const content = await getFileContent(filePath);
    if (content === null) {
      res.status(404).json({ error: "File not found or not readable" });
      return;
    }
    req.log.info({ path: filePath, length: content.length }, "devbot file fetched");
    res.json({ path: filePath, content });
  } catch (err) {
    req.log.error({ err, path: filePath }, "devbot file fetch failed");
    res.status(500).json({ error: "Failed to fetch file from GitHub" });
  }
});

// ── POST /api/devbot/chat ─────────────────────────────────────────────────────

router.post("/devbot/chat", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { message, history, loadedFiles, sessionId: incomingSessionId, imageData, imageMediaType } = req.body as DevBotBody;

  if (!message?.trim() && !imageData) {
    res.status(400).json({ error: "message or imageData is required" });
    return;
  }

  const sessionId = incomingSessionId?.trim() || `session_${Date.now()}`;

  const conversationHistory: HistoryMessage[] = Array.isArray(history) ? history : [];
  const clientLoadedFiles: string[] = Array.isArray(loadedFiles) ? loadedFiles : [];

  // ── Image / screenshot handler ────────────────────────────────────────────
  if (imageData) {
    const sizeKb = Math.round(imageData.length * 0.75 / 1024);
    const userText = message?.trim() || "Analyze this screenshot and identify any bugs or issues you can see.";

    const reply =
      `📸 Screenshot received!\n\n` +
      `Vision analysis offline — Claude API key pending.\n\n` +
      `Image size: ${sizeKb}KB\n` +
      `When API is funded, DevBot will:\n` +
      `• Identify the broken component\n` +
      `• Find the exact file in codebase\n` +
      `• Generate a fix automatically`;

    // Save user message + assistant reply to memory
    await saveMessage(sessionId, "user", userText);
    await saveMessage(sessionId, "assistant", reply);

    // Persist to devbot_screenshots (fire-and-forget, non-blocking)
    const sb = getServiceClient();
    if (sb) {
      sb.from("devbot_screenshots").insert({
        session_id:    sessionId,
        image_size_kb: sizeKb,
        message:       userText,
        analysis:      reply,
      }).then(({ error }) => {
        if (error) req.log.warn({ err: error }, "devbot screenshot insert failed");
      });
    }

    req.log.info({ sessionId, sizeKb }, "devbot screenshot received");
    res.json({ reply, sessionId });
    return;
  }

  // ── Task queue create handler ─────────────────────────────────────────────
  const taskQueueMatch = message!.match(/^tasks?:\s*\n([\s\S]+)/i);
  if (taskQueueMatch) {
    const lines = taskQueueMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      const reply = "No tasks found. Format:\n```\ntasks:\n1. First task\n2. Second task\n```";
      res.json({ reply, sessionId });
      return;
    }

    const queue = await createQueue(sessionId, lines);

    let reply = `📋 Task Queue Created!\n\n`;
    reply += `${lines.length} task${lines.length !== 1 ? "s" : ""} queued:\n`;
    lines.forEach((task, i) => { reply += `${i + 1}. ⏳ ${task}\n`; });
    reply += `\nQueue ID: \`${queue.id}\`\n`;
    reply += `Type \`run queue ${queue.id}\` to start processing.`;

    await saveMessage(sessionId, "assistant", reply);
    res.json({ reply, sessionId });
    return;
  }

  // ── Task queue run handler ────────────────────────────────────────────────
  const runQueueMatch = message!.match(/run queue\s+([a-f0-9-]+)/i);
  if (runQueueMatch) {
    const queueId = runQueueMatch[1];
    const queue = await getQueue(queueId);

    if (!queue) {
      const reply = `Queue \`${queueId}\` not found.`;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
      return;
    }

    const results = await processQueue(queueId, sessionId);

    let reply = `✅ Queue Complete!\n\n`;
    results.forEach((r, i) => {
      reply += `${i + 1}. ✅ ${r.task}\n`;
      reply += `   ${r.result ?? ""}\n\n`;
    });
    reply = reply.trim();

    await saveMessage(sessionId, "assistant", reply);
    res.json({ reply, sessionId });
    return;
  }

  // ── Terminal command handler ──────────────────────────────────────────────
  const terminalMatch = message!.trim().match(/^(run|exec|install|npm install|npm run)\s+(.+)$/i);
  if (terminalMatch) {
    const action = terminalMatch[1].toLowerCase();
    let command = terminalMatch[2].trim();

    if (action === "install") {
      command = `npm install ${command}`;
    } else if (action === "exec") {
      command = command;
    }

    const result = await runCommand(command, sessionId);

    let reply = `💻 Terminal output:\n\`\`\`\n`;
    if (result.stdout) reply += result.stdout;
    if (result.stderr) reply += result.stderr;
    reply += `\`\`\`\nExit code: ${result.exitCode} | Duration: ${result.duration}ms`;

    if (result.exitCode !== 0) {
      reply += `\n\n❌ Command failed. Check stderr above.`;
    } else {
      reply += `\n\n✅ Command completed successfully.`;
    }

    req.log.info({ command, exitCode: result.exitCode, duration: result.duration }, "devbot terminal command via chat");
    await saveMessage(sessionId, "assistant", reply);
    res.json({ reply, sessionId });
    return;
  }

  // ── Rollback command handler ──────────────────────────────────────────────
  const rollbackMatch = message.trim().match(/rollback\s+([^\s]+?)(?:\s+version\s+(\S+))?$/i);
  if (rollbackMatch && githubConfigured()) {
    const targetFile = rollbackMatch[1];
    const versionId  = rollbackMatch[2];

    let snapshot = null;
    try {
      if (versionId) {
        snapshot = await getSnapshotById(versionId);
      } else {
        const snapshots = await getSnapshots(targetFile);
        snapshot = snapshots[0] ?? null;
      }
    } catch (snapErr) {
      req.log.warn({ err: snapErr }, "devbot rollback: snapshot lookup failed");
    }

    if (!snapshot) {
      res.json({ reply: `No rollback snapshot found for \`${targetFile}\`. Try applying a change first so a snapshot is saved.`, sessionId });
      return;
    }

    try {
      // Write the old content back to a rollback branch
      const rts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const rollbackBranch = `devbot/rollback_${rts}`;
      await createBranch(rollbackBranch);
      const { commitUrl } = await createOrUpdateFile(
        snapshot.file_path,
        snapshot.old_content,
        `rollback: restore ${snapshot.file_path}`,
        rollbackBranch,
      );
      const restoredAt = new Date(snapshot.created_at).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const reply = `✅ Rolled back \`${snapshot.file_path}\` to version from ${restoredAt}.\n\nThe old content has been written to branch \`${rollbackBranch}\`. [View commit](${commitUrl})`;
      req.log.info({ file: snapshot.file_path, branch: rollbackBranch }, "devbot rollback completed");
      res.json({ reply, sessionId });
    } catch (rollbackErr) {
      req.log.error({ err: rollbackErr }, "devbot rollback write failed");
      res.status(500).json({ error: rollbackErr instanceof Error ? rollbackErr.message : "Rollback failed" });
    }
    return;
  }

  // ── Scan command handler ───────────────────────────────────────────────────
  if (
    message.toLowerCase().includes("run scan") ||
    message.toLowerCase().includes("scan codebase")
  ) {
    try {
      const results = await runFullScan();
      const reply =
        `🔍 Scan complete!\n\n` +
        `Critical: ${results.critical}\n` +
        `Warnings: ${results.warnings}\n` +
        `Files scanned: ${results.totalFiles}\n\n` +
        `Full report sent to Telegram.`;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    } catch (scanErr) {
      req.log.error({ err: scanErr }, "devbot scan command failed");
      res.status(500).json({ error: "Scan failed" });
    }
    return;
  }

  // ── Database: show schema / list tables ──────────────────────────────────
  if (
    message.toLowerCase().includes("show schema") ||
    message.toLowerCase().includes("list tables")
  ) {
    try {
      const schema = await getSchema();
      const tableList = Object.keys(schema).join(", ");
      const reply = `📊 Database Schema\n\nTables found: ${Object.keys(schema).length}\n\n${tableList}\n\nType "describe [tablename]" to see columns.`;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    } catch (dbErr) {
      req.log.error({ err: dbErr }, "devbot show schema failed");
      res.status(500).json({ error: "Failed to fetch schema" });
    }
    return;
  }

  // ── Database: describe table ──────────────────────────────────────────────
  const describeMatch = message.match(/describe\s+(\w+)/i);
  if (describeMatch) {
    try {
      const schema    = await getSchema();
      const tableName = describeMatch[1]!;
      const columns   = schema[tableName];
      let reply: string;
      if (!columns) {
        reply = `Table "${tableName}" not found. Type "list tables" to see all tables.`;
      } else {
        const colList = columns
          .map((c) => `  ${c.columnName} (${c.dataType}${c.isNullable === "NO" ? ", required" : ""})`)
          .join("\n");
        reply = `📋 Table: ${tableName}\n\nColumns:\n${colList}`;
      }
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    } catch (dbErr) {
      req.log.error({ err: dbErr }, "devbot describe table failed");
      res.status(500).json({ error: "Failed to describe table" });
    }
    return;
  }

  // ── Database: table stats / db stats ─────────────────────────────────────
  if (
    message.toLowerCase().includes("table stats") ||
    message.toLowerCase().includes("database stats") ||
    message.toLowerCase().includes("db stats")
  ) {
    try {
      const stats = await getTableStats();
      const statList = stats.map((s) => `  ${s.tableName}: ${s.rowCount} rows`).join("\n");
      const reply = `📈 Database Stats\n\n${statList}`;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    } catch (dbErr) {
      req.log.error({ err: dbErr }, "devbot table stats failed");
      res.status(500).json({ error: "Failed to fetch table stats" });
    }
    return;
  }

  // ── Database: run query ───────────────────────────────────────────────────
  const queryMatch = message.match(/^query:\s*(.+)$/is);
  if (queryMatch) {
    const sql = queryMatch[1]!.trim();
    try {
      const result  = await runQuery(sql);
      const preview = JSON.stringify(result.rows.slice(0, 5), null, 2);
      const reply   =
        `🗄️ Query Result\n\nRows returned: ${result.rowCount}\nTime: ${result.executionTime}ms\n\n\`\`\`json\n${preview}\n\`\`\``;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : "Query failed";
      req.log.error({ err: dbErr, sql }, "devbot run query failed");
      const reply = `❌ Query error: ${msg}`;
      await saveMessage(sessionId, "assistant", reply);
      res.json({ reply, sessionId });
    }
    return;
  }

  // Persist user message
  await saveMessage(sessionId, "user", message.trim());

  // Build memory context
  const memoryContext = await buildContext(sessionId, message.trim());

  let fileContext = "";
  let autoDetectedFiles: string[] = [];

  if (githubConfigured()) {
    try {
      const allFiles = await getCachedFiles();
      const knownPaths = allFiles.map((f) => f.path);

      autoDetectedFiles = detectFilePaths(message.trim(), knownPaths);

      const filesToLoad = [
        ...clientLoadedFiles,
        ...autoDetectedFiles.filter((f) => !clientLoadedFiles.includes(f)),
      ];

      if (filesToLoad.length > 0) {
        fileContext = await buildFileContext(filesToLoad);
        req.log.info(
          { clientFiles: clientLoadedFiles.length, autoFiles: autoDetectedFiles.length, total: filesToLoad.length },
          "devbot file context built"
        );
      }
    } catch (err) {
      req.log.warn({ err }, "devbot file context fetch failed — continuing without file context");
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  let reply: string;

  if (!apiKey) {
    reply = `DevBot brain offline — Claude API key pending.\n\nMemory: ${memoryContext ? "Loaded ✓" : "Empty"}\nSession: ${sessionId}`;
  } else {
    const systemPrompt = MASTER_CONTEXT + (memoryContext ? `\n\n${memoryContext}` : "") + fileContext;

    try {
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: message.trim() },
        ],
      });

      const block = response.content[0];
      reply = block.type === "text" ? block.text : "No response from model.";

      req.log.info(
        { inputLength: message.length, outputLength: reply.length, fileContextLength: fileContext.length },
        "devbot chat completed"
      );
    } catch (err) {
      req.log.error({ err }, "devbot chat failed");
      res.status(500).json({ error: "DevBot request failed. Check server logs." });
      return;
    }
  }

  // Persist assistant reply
  await saveMessage(sessionId, "assistant", reply);

  res.json({ reply, autoDetectedFiles, sessionId });
});

// ── POST /api/devbot/write ────────────────────────────────────────────────────
// Writes a file to a devbot branch (creating the branch if needed).

router.post("/devbot/write", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  if (!githubConfigured()) {
    res.status(503).json({ error: "GitHub not configured" });
    return;
  }

  const { path, content, message, branch, sessionId: writeSessionId } = req.body as WriteBody;

  if (!path?.trim()) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  if (content === undefined || content === null) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    // Generate a new branch name if not provided
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const targetBranch = branch?.trim() || `devbot/${ts}`;

    // ── Snapshot old content before overwriting ────────────────────────────
    try {
      const oldContent = await getFileContent(path.trim());
      if (oldContent !== null) {
        await saveSnapshot(
          writeSessionId ?? `write_${Date.now()}`,
          path.trim(),
          oldContent,
          message.trim(),
        );
        req.log.info({ path: path.trim() }, "devbot snapshot saved before write");
      }
    } catch (snapErr) {
      req.log.warn({ err: snapErr }, "devbot snapshot failed — continuing with write");
    }

    // Create the branch if it's new (silently succeeds if already exists)
    if (!branch?.trim()) {
      await createBranch(targetBranch);
      req.log.info({ branch: targetBranch }, "devbot branch created");
    }

    const { commitUrl, sha } = await createOrUpdateFile(
      path.trim(),
      content,
      message.trim(),
      targetBranch
    );

    req.log.info({ path: path.trim(), branch: targetBranch, sha }, "devbot file written");

    // ── Auto-test the affected endpoint ───────────────────────────────────────
    let testSummary = "";
    const testTarget = getEndpointForFile(path.trim());
    if (testTarget) {
      const result = await runTest(
        writeSessionId ?? `write_${Date.now()}`,
        path.trim(),
        testTarget.endpoint,
        testTarget.method,
      );
      testSummary = result.passed
        ? `✅ Auto-test passed: ${testTarget.endpoint} returned ${result.status}`
        : `❌ Auto-test FAILED: ${testTarget.endpoint} returned ${result.status}\nPreview: ${result.preview}`;
      req.log.info(
        { passed: result.passed, endpoint: testTarget.endpoint, status: result.status },
        "devbot auto-test completed",
      );
    }

    res.json({ success: true, commitUrl, branch: targetBranch, sha, testSummary });
  } catch (err) {
    req.log.error({ err, path }, "devbot write failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to write file" });
  }
});

// ── POST /api/devbot/deploy ───────────────────────────────────────────────────
// Creates a PR from the devbot branch and merges it immediately.

router.post("/devbot/deploy", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  if (!githubConfigured()) {
    res.status(503).json({ error: "GitHub not configured" });
    return;
  }

  const { branch, title } = req.body as DeployBody;

  if (!branch?.trim()) {
    res.status(400).json({ error: "branch is required" });
    return;
  }

  const prTitle = title?.trim() || `DevBot changes from ${branch}`;
  const prBody = `Automated deployment created by DevBot admin panel.\n\nBranch: \`${branch}\``;

  try {
    const { prNumber, prUrl } = await createPullRequest(prTitle, prBody, branch.trim());
    req.log.info({ prNumber, branch }, "devbot PR created");

    await mergePullRequest(prNumber);
    req.log.info({ prNumber }, "devbot PR merged");

    res.json({ success: true, deployUrl: prUrl, prNumber });
  } catch (err) {
    req.log.error({ err, branch }, "devbot deploy failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Deploy failed" });
  }
});

// ── GET /api/devbot/report ────────────────────────────────────────────────────
// Generates and returns this week's stats as JSON.

router.get("/devbot/report", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const stats = await generateWeeklyReport();
    req.log.info({ newUsers: stats.newUsers, revenueNaira: stats.revenueNaira }, "devbot report fetched");
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "devbot report generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Report generation failed" });
  }
});

// ── POST /api/devbot/report ───────────────────────────────────────────────────
// Generates the report AND sends it to Telegram immediately.

router.post("/devbot/report", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const stats = await sendWeeklyReportTelegram();
    req.log.info({ newUsers: stats.newUsers }, "devbot report sent to Telegram");
    res.json({ success: true, stats });
  } catch (err) {
    req.log.error({ err }, "devbot report send failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Report send failed" });
  }
});

// ── GET /api/devbot/health ────────────────────────────────────────────────────
// Manually triggers a health check and returns the result.
// Also returns the cached result from the last automatic check if available.

router.get("/devbot/health", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    // Use cached result if it's less than 60 seconds old — avoid hammering the DB
    const cached = getLastHealthResult();
    const AGE_THRESHOLD_MS = 60_000;
    const isFresh = cached && (Date.now() - new Date(cached.lastChecked).getTime()) < AGE_THRESHOLD_MS;

    const result = isFresh ? cached : await runHealthCheck();

    req.log.info({ status: result.status, errorCount: result.errorCount }, "devbot health check");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "devbot health check failed");
    res.status(500).json({ error: "Health check failed" });
  }
});

// ── GET /api/devbot/memory ────────────────────────────────────────────────────
// Returns last 20 memory rows ordered by created_at desc.

router.get("/devbot/memory", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const sb = getServiceClient();
    if (!sb) {
      res.status(503).json({ error: "Service unavailable" });
      return;
    }
    const { data, error } = await sb
      .from("devbot_memory")
      .select("id, session_id, role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ rows: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "devbot memory fetch failed");
    res.status(500).json({ error: "Failed to fetch memory" });
  }
});

// ── GET /api/devbot/lessons ───────────────────────────────────────────────────
// Returns all lessons ordered by applied_count desc.

router.get("/devbot/lessons", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const rows = await getLessons();
    res.json({ rows });
  } catch (err) {
    req.log.error({ err }, "devbot lessons fetch failed");
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

// ── POST /api/devbot/execute ──────────────────────────────────────────────────
// Runs a shell command directly and returns the output.

router.post("/devbot/execute", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { command, sessionId: execSessionId } = req.body as { command?: string; sessionId?: string };

  if (!command?.trim()) {
    res.status(400).json({ error: "command is required" });
    return;
  }

  try {
    const result = await runCommand(command.trim(), execSessionId ?? `exec_${Date.now()}`);
    req.log.info({ command: command.trim(), exitCode: result.exitCode }, "devbot execute route");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "devbot execute failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Execution failed" });
  }
});

// ── GET /api/devbot/terminal-logs ─────────────────────────────────────────────
// Returns last 20 terminal command logs ordered by created_at desc.

router.get("/devbot/terminal-logs", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const rows = await getTerminalLogs();
    req.log.info({ count: rows.length }, "devbot terminal-logs fetched");
    res.json({ rows });
  } catch (err) {
    req.log.error({ err }, "devbot terminal-logs fetch failed");
    res.status(500).json({ error: "Failed to fetch terminal logs" });
  }
});

// ── GET /api/devbot/rollbacks ─────────────────────────────────────────────────
// Returns last 20 rollback snapshots ordered by created_at desc.

router.get("/devbot/rollbacks", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const rows = await getAllSnapshots();
    req.log.info({ count: rows.length }, "devbot rollbacks fetched");
    res.json({ rows });
  } catch (err) {
    req.log.error({ err }, "devbot rollbacks fetch failed");
    res.status(500).json({ error: "Failed to fetch rollback history" });
  }
});

// ── GET /api/devbot/tests ─────────────────────────────────────────────────────
// Returns last 20 auto-test results ordered by tested_at desc.

router.get("/devbot/tests", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const sb = getServiceClient();
    if (!sb) {
      res.status(503).json({ error: "Service unavailable" });
      return;
    }
    const { data, error } = await sb
      .from("devbot_test_results")
      .select("id, session_id, file_changed, endpoint_tested, http_status, passed, response_preview, tested_at")
      .order("tested_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    req.log.info({ count: (data ?? []).length }, "devbot tests fetched");
    res.json({ rows: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "devbot tests fetch failed");
    res.status(500).json({ error: "Failed to fetch test results" });
  }
});

// ── POST /api/devbot/scan ─────────────────────────────────────────────────────
// Triggers an immediate full code scan. Admin-protected.

router.post("/devbot/scan", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const results = await runFullScan();
    req.log.info({ totalFiles: results.totalFiles, critical: results.critical, warnings: results.warnings }, "devbot manual scan triggered");
    res.json({
      findings:     results.findings,
      totalFiles:   results.totalFiles,
      criticalCount: results.critical,
      warningCount:  results.warnings,
    });
  } catch (err) {
    req.log.error({ err }, "devbot scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

// ── GET /api/devbot/scan-results ──────────────────────────────────────────────
// Returns last 50 scan results, unresolved first. Admin-protected.

router.get("/devbot/scan-results", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  try {
    const { data, error } = await sb
      .from("devbot_scan_results")
      .select("id, file_path, line_number, issue, severity, resolved, scan_date")
      .order("resolved",   { ascending: true })
      .order("scan_date",  { ascending: false })
      .limit(50);
    if (error) throw error;
    req.log.info({ count: (data ?? []).length }, "devbot scan-results fetched");
    res.json({ rows: data ?? [] });
  } catch (err) {
    req.log.error({ err }, "devbot scan-results fetch failed");
    res.status(500).json({ error: "Failed to fetch scan results" });
  }
});

// ── PATCH /api/devbot/scan-results/:id/resolve ────────────────────────────────
// Marks a scan finding as resolved. Admin-protected.

router.patch("/devbot/scan-results/:id/resolve", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { id } = req.params;
  if (!id) { res.status(400).json({ error: "id is required" }); return; }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  try {
    const { error } = await sb
      .from("devbot_scan_results")
      .update({ resolved: true })
      .eq("id", id);
    if (error) throw error;
    req.log.info({ id }, "devbot scan result resolved");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "devbot scan result resolve failed");
    res.status(500).json({ error: "Failed to resolve scan result" });
  }
});

// ── POST /api/devbot/capture-error ───────────────────────────────────────────
// Public — no auth. Called by the frontend error boundary and global listeners.

router.post("/devbot/capture-error", async (req: Request, res: Response) => {
  const { userId, userEmail, pageUrl, errorMessage, errorStack, component, severity } =
    req.body as {
      userId?: string; userEmail?: string; pageUrl?: string;
      errorMessage?: string; errorStack?: string;
      component?: string; severity?: string;
    };

  if (!pageUrl?.trim() || !errorMessage?.trim()) {
    res.status(400).json({ error: "pageUrl and errorMessage are required" });
    return;
  }

  try {
    const id = await captureError({
      userId, userEmail,
      pageUrl: pageUrl.trim(),
      errorMessage: errorMessage.trim(),
      errorStack, component, severity,
    });
    req.log.info({ id, pageUrl, component }, "devbot error captured via API");
    res.json({ success: true, id });
  } catch (err) {
    req.log.error({ err }, "devbot capture-error failed");
    res.status(500).json({ error: "Failed to capture error" });
  }
});

// ── GET /api/devbot/errors ────────────────────────────────────────────────────
// Returns captured user errors. Optional ?resolved=true|false filter.

router.get("/devbot/errors", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const resolvedParam = req.query["resolved"] as string | undefined;
  const resolvedFilter =
    resolvedParam === "true"  ? true  :
    resolvedParam === "false" ? false : undefined;

  try {
    const rows = await getErrors(resolvedFilter);
    req.log.info({ count: rows.length }, "devbot errors fetched");
    res.json({ rows });
  } catch (err) {
    req.log.error({ err }, "devbot errors fetch failed");
    res.status(500).json({ error: "Failed to fetch errors" });
  }
});

// ── PATCH /api/devbot/errors/:id/resolve ─────────────────────────────────────
// Marks a single error as resolved.

router.patch("/devbot/errors/:id/resolve", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    await markResolved(id);
    req.log.info({ id }, "devbot error marked resolved");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "devbot error resolve failed");
    res.status(500).json({ error: "Failed to resolve error" });
  }
});

// ── GET /api/devbot/schema ────────────────────────────────────────────────────
// Returns the public schema grouped by table. Admin-protected.

router.get("/devbot/schema", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const schema = await getSchema();
    req.log.info({ tables: Object.keys(schema).length }, "devbot schema fetched");
    res.json({ schema });
  } catch (err) {
    req.log.error({ err }, "devbot schema fetch failed");
    res.status(500).json({ error: "Failed to fetch schema" });
  }
});

// ── POST /api/devbot/query ────────────────────────────────────────────────────
// Runs a SELECT query. Admin-protected.

router.post("/devbot/query", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { sql } = req.body as { sql?: string };
  if (!sql?.trim()) {
    res.status(400).json({ error: "sql is required" });
    return;
  }

  try {
    const result = await runQuery(sql.trim());
    req.log.info({ rowCount: result.rowCount, executionTime: result.executionTime }, "devbot query executed");
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Query failed";
    req.log.warn({ err, sql }, "devbot query rejected or failed");
    res.status(400).json({ error: msg });
  }
});

// ── GET /api/devbot/queues ────────────────────────────────────────────────────
// Returns last 20 task queues ordered by created_at desc. Admin-protected.

router.get("/devbot/queues", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Supabase not configured" }); return; }

  const { data, error } = await sb
    .from("devbot_task_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ queues: data ?? [] });
});

// ── GET /api/devbot/queues/:id ────────────────────────────────────────────────
// Returns single queue by id. Admin-protected.

router.get("/devbot/queues/:id", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Supabase not configured" }); return; }

  const { data, error } = await sb
    .from("devbot_task_queue")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) { res.status(404).json({ error: "Queue not found" }); return; }
  res.json({ queue: data });
});

// ── GET /api/devbot/table-stats ───────────────────────────────────────────────
// Returns row counts for core tables. Admin-protected.

router.get("/devbot/table-stats", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  try {
    const stats = await getTableStats();
    req.log.info({ tables: stats.length }, "devbot table-stats fetched");
    res.json({ stats });
  } catch (err) {
    req.log.error({ err }, "devbot table-stats fetch failed");
    res.status(500).json({ error: "Failed to fetch table stats" });
  }
});

export default router;
