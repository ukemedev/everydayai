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
}

interface WriteBody {
  path?: string;
  content?: string;
  message?: string;
  branch?: string;
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

  const { message, history, loadedFiles, sessionId: incomingSessionId } = req.body as DevBotBody;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const sessionId = incomingSessionId?.trim() || `session_${Date.now()}`;

  const conversationHistory: HistoryMessage[] = Array.isArray(history) ? history : [];
  const clientLoadedFiles: string[] = Array.isArray(loadedFiles) ? loadedFiles : [];

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

  const { path, content, message, branch } = req.body as WriteBody;

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
    res.json({ success: true, commitUrl, branch: targetBranch, sha });
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

export default router;
