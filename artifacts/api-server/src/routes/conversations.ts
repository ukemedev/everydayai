import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { sanitizeText } from "../lib/sanitize.js";
import { decrypt, isEncrypted } from "../lib/encryption.js";
import { sendWhatsAppMessage } from "../lib/whatsappClient.js";
import { sendMetaMessage } from "../lib/metaClient.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Channel reply adapters ─────────────────────────────────────────────────────
// For 'web': customer polls GET /api/public/conversations/messages — nothing to push.
// For 'whatsapp': look up deployment credentials and push via Meta Cloud API.
async function sendChannelReply(channel: string, sessionKey: string, content: string, agentId: string): Promise<void> {
  switch (channel) {
    case "web":
      break; // customer polls DB

    case "whatsapp": {
      const sb = getServiceClient();
      if (!sb) { logger.warn({ agentId }, "WhatsApp reply: service client unavailable"); break; }

      const { data: dep } = await sb
        .from("whatsapp_deployments")
        .select("phone_number_id, access_token")
        .eq("agent_id", agentId)
        .eq("status", "active")
        .maybeSingle();

      if (!dep) { logger.warn({ agentId }, "WhatsApp reply: no active deployment found"); break; }

      const rawToken   = dep.access_token as string;
      const token      = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
      const phoneNumId = dep.phone_number_id as string;

      await sendWhatsAppMessage(phoneNumId, token, sessionKey, content);
      break;
    }

    case "telegram":
      logger.warn({ channel }, "Telegram human-reply adapter not yet implemented");
      break;

    case "messenger": {
      const sb = getServiceClient();
      if (!sb) { logger.warn({ agentId }, "Messenger reply: service client unavailable"); break; }

      const { data: dep } = await sb
        .from("messenger_deployments")
        .select("access_token")
        .eq("agent_id", agentId)
        .eq("status", "active")
        .maybeSingle();

      if (!dep) { logger.warn({ agentId }, "Messenger reply: no active deployment"); break; }

      const rawToken = dep.access_token as string;
      const token    = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
      await sendMetaMessage(token, sessionKey, content);
      break;
    }

    case "instagram": {
      const sb = getServiceClient();
      if (!sb) { logger.warn({ agentId }, "Instagram reply: service client unavailable"); break; }

      const { data: dep } = await sb
        .from("instagram_deployments")
        .select("access_token")
        .eq("agent_id", agentId)
        .eq("status", "active")
        .maybeSingle();

      if (!dep) { logger.warn({ agentId }, "Instagram reply: no active deployment"); break; }

      const rawToken = dep.access_token as string;
      const token    = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
      await sendMetaMessage(token, sessionKey, content);
      break;
    }

    default:
      logger.warn({ channel }, "No reply adapter for channel");
  }
}

// ─── GET /api/conversations ───────────────────────────────────────────────────
// List conversations owned by the authenticated user (paginated).
// Query: channel?, mode?, status? (default: active), limit? (max 100), offset?

router.get("/conversations", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { channel, mode, status = "active", limit = "50", offset = "0" } = req.query as Record<string, string>;
  const parsedLimit  = Math.min(Math.max(parseInt(limit)  || 50,  1), 100);
  const parsedOffset = Math.max(parseInt(offset) || 0, 0);

  let query = sb
    .from("conversations")
    .select("id, agent_id, agent_name, channel, customer_display, mode, status, unread_count, last_message_at, last_message_preview, created_at", { count: "exact" })
    .eq("owner_id", userId)
    .eq("status", status)
    .order("last_message_at", { ascending: false })
    .range(parsedOffset, parsedOffset + parsedLimit - 1);

  if (channel) query = query.eq("channel", channel);
  if (mode)    query = query.eq("mode",    mode);

  const { data, error, count } = await query;
  if (error) {
    req.log.error({ err: error }, "failed to list conversations");
    res.status(500).json({ error: "Failed to load conversations" });
    return;
  }
  res.json({ conversations: data ?? [], total: count ?? 0, limit: parsedLimit, offset: parsedOffset });
});

// ─── GET /api/conversations/:id/messages ─────────────────────────────────────
// Full message history. Also resets unread_count to 0.

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params as { id: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: conv } = await sb
    .from("conversations")
    .select("id, owner_id, channel, channel_conversation_id, agent_id, agent_name, customer_display, mode, status, unread_count")
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv as { owner_id: string }).owner_id !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const { data: msgs, error: msgErr } = await sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgErr) {
    req.log.error({ err: msgErr }, "failed to fetch messages");
    res.status(500).json({ error: "Failed to load messages" });
    return;
  }

  // Reset unread count silently (non-blocking)
  if ((conv as { unread_count: number }).unread_count > 0) {
    void sb.from("conversations").update({ unread_count: 0 }).eq("id", id);
  }

  res.json({ conversation: conv, messages: msgs ?? [] });
});

// ─── PATCH /api/conversations/:id/mode ───────────────────────────────────────
// Toggle AI / Human. Atomic single DB write — safe against race conditions.

router.patch("/conversations/:id/mode", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params as { id: string };
  const { mode } = req.body as { mode: "ai" | "human" };

  if (mode !== "ai" && mode !== "human") {
    res.status(400).json({ error: "mode must be 'ai' or 'human'" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data, error } = await sb
    .from("conversations")
    .update({ mode })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id, mode")
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: "Conversation not found or unauthorized" });
    return;
  }

  req.log.info({ conversationId: id, mode }, "conversation mode changed");
  res.json({ id: (data as { id: string }).id, mode: (data as { mode: string }).mode });
});

// ─── POST /api/conversations/:id/reply ───────────────────────────────────────
// Human owner sends a reply from the inbox dashboard.

router.post("/conversations/:id/reply", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params as { id: string };
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const cleanContent = sanitizeText(content.trim().slice(0, 2000));

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // Verify ownership and get channel info in one query
  const { data: conv } = await sb
    .from("conversations")
    .select("id, owner_id, channel, channel_conversation_id, agent_id, mode")
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv as { owner_id: string }).owner_id !== userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if ((conv as { mode: string }).mode !== "human") {
    res.status(409).json({ error: "Switch to Human mode before replying manually." });
    return;
  }

  // Save to DB first — customer polls will pick it up immediately
  const { data: msg, error: msgErr } = await sb
    .from("messages")
    .insert({ conversation_id: id, role: "human", content: cleanContent })
    .select("id, role, content, created_at")
    .single();

  if (msgErr || !msg) {
    req.log.error({ err: msgErr }, "failed to insert human reply");
    res.status(500).json({ error: "Failed to save reply" });
    return;
  }

  // Update conversation preview (non-blocking)
  void sb.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: `You: ${cleanContent.slice(0, 75)}`,
  }).eq("id", id);

  // Fire channel adapter for external channels (non-blocking)
  void sendChannelReply(
    (conv as { channel: string }).channel,
    (conv as { channel_conversation_id: string }).channel_conversation_id,
    cleanContent,
    (conv as { agent_id: string }).agent_id
  );

  req.log.info({ conversationId: id, channel: (conv as { channel: string }).channel }, "human reply saved");
  res.json({ message: msg });
});

// ─── PATCH /api/conversations/:id/archive ────────────────────────────────────

router.patch("/conversations/:id/archive", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params as { id: string };
  const { archive = true } = req.body as { archive?: boolean };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { error } = await sb
    .from("conversations")
    .update({ status: archive ? "archived" : "active" })
    .eq("id", id)
    .eq("owner_id", userId);

  if (error) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json({ ok: true });
});

// ─── GET /api/public/conversations/messages ───────────────────────────────────
// PUBLIC — no auth. Polled by Chat.tsx to receive human replies in real time.
// Returns new messages (role: human or ai) since a given ISO timestamp.

router.get("/public/conversations/messages", async (req: Request, res: Response) => {
  const { agentId, sessionId, since } = req.query as { agentId?: string; sessionId?: string; since?: string };

  if (!agentId?.trim() || !sessionId?.trim()) {
    res.status(400).json({ error: "agentId and sessionId are required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: conv } = await sb
    .from("conversations")
    .select("id, mode")
    .eq("agent_id", agentId.trim())
    .eq("channel", "web")
    .eq("channel_conversation_id", sessionId.trim())
    .maybeSingle();

  if (!conv) { res.json({ messages: [], mode: "ai" }); return; }

  let query = sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", (conv as { id: string }).id)
    .in("role", ["human", "ai"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (since) query = query.gt("created_at", since);

  const { data: msgs } = await query;
  res.json({ messages: msgs ?? [], mode: (conv as { mode: string }).mode });
});

export default router;
