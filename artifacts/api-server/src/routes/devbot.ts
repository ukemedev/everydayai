import { Router } from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { MASTER_CONTEXT } from "../lib/masterContext.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(
  req: Request,
  res: Response
): Promise<boolean> {
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

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface DevBotBody {
  message?: string;
  history?: HistoryMessage[];
}

// ─── POST /api/devbot/chat ────────────────────────────────────────────────────

router.post("/devbot/chat", async (req: Request, res: Response) => {
  const authorized = await requireAdmin(req, res);
  if (!authorized) return;

  const { message, history } = req.body as DevBotBody;

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

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: MASTER_CONTEXT,
      messages: [
        ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message.trim() },
      ],
    });

    const block = response.content[0];
    const reply = block.type === "text" ? block.text : "No response from model.";

    req.log.info({ inputLength: message.length, outputLength: reply.length }, "devbot chat completed");
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "devbot chat failed");
    res.status(500).json({ error: "DevBot request failed. Check server logs." });
  }
});

export default router;
