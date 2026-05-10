import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { MASTER_CONTEXT } from "../lib/masterContext.js";
import { getRepoFiles, getFileContent, detectFilePaths } from "../lib/github.js";

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

function truncateContent(content: string, filePath: string): string {
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
        const truncated = truncateContent(content, path);
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

  const { message, history, loadedFiles } = req.body as DevBotBody;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not set");
    res.status(503).json({ error: "DevBot is not configured. Set ANTHROPIC_API_KEY." });
    return;
  }

  const conversationHistory: HistoryMessage[] = Array.isArray(history) ? history : [];
  const clientLoadedFiles: string[] = Array.isArray(loadedFiles) ? loadedFiles : [];

  // ── Build file context ─────────────────────────────────────────────────────
  let fileContext = "";
  let autoDetectedFiles: string[] = [];

  if (githubConfigured()) {
    try {
      const allFiles = await getCachedFiles();
      const knownPaths = allFiles.map((f) => f.path);

      // Auto-detect file paths mentioned in the current message
      autoDetectedFiles = detectFilePaths(message.trim(), knownPaths);

      // Merge: client-loaded files first (explicit), then auto-detected
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

  // ── Call Claude ───────────────────────────────────────────────────────────
  const systemPrompt = MASTER_CONTEXT + fileContext;

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
    const reply = block.type === "text" ? block.text : "No response from model.";

    req.log.info(
      { inputLength: message.length, outputLength: reply.length, fileContextLength: fileContext.length },
      "devbot chat completed"
    );

    res.json({ reply, autoDetectedFiles });
  } catch (err) {
    req.log.error({ err }, "devbot chat failed");
    res.status(500).json({ error: "DevBot request failed. Check server logs." });
  }
});

export default router;
