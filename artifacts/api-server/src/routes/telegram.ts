import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { sanitizeText, detectPromptInjection } from "../lib/sanitize.js";
import {
  checkAgentDailyLimit, incrementAgentDailyCount, checkIpRateLimit,
  checkCustomerDailyLimit, incrementCustomerDailyCount, checkBurstLimit,
  isDuplicateMessage, isAiCooldownActive, setAiCooldown,
  CUSTOMER_DAILY_LIMIT_MESSAGE, BURST_LIMIT_MESSAGE, DUPLICATE_MESSAGE, COOLDOWN_MESSAGE,
} from "../lib/agentLimits.js";
import { getUserPlan } from "../lib/planLimits.js";
import { verifyAgentOwnership, checkChannelExclusivity } from "../lib/channelGuard.js";
import { encrypt, decrypt, isEncrypted } from "../lib/encryption.js";
import { getServiceClient } from "../lib/supabaseService.js";
import { enqueueMessage } from "../lib/queue.js";
import { getProviderForModel } from "../lib/aiDispatch.js";

const router = Router();

// ─── POST /api/telegram/webhook/:agentId ────────────────────────────────────

router.post("/telegram/webhook/:agentId", async (req: Request, res: Response) => {
  // Acknowledge immediately — worker processes asynchronously
  res.status(200).json({ status: "ok" });

  const { agentId } = req.params as { agentId: string };

  const body = req.body as {
    message?: {
      message_id?: number;
      chat?: { id?: number; type?: string };
      text?: string;
    };
  };

  const msg = body.message;
  if (!msg || !msg.text?.trim() || !msg.chat?.id) return;

  const text = sanitizeText(msg.text.trim());
  if (!text || detectPromptInjection(text)) {
    logger.warn({ agentId }, "Telegram message rejected");
    return;
  }

  const chatId = String(msg.chat.id);
  const sb = getServiceClient();
  if (!sb) return;

  try {
    const { data: dep } = await sb
      .from("telegram_deployments")
      .select("bot_token, user_id")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .maybeSingle();

    if (!dep) { logger.warn({ agentId }, "No active Telegram deployment"); return; }

    const deployOwner = dep.user_id as string;

    const { data: agent } = await sb
      .from("agents")
      .select("model, instructions, user_id, name, status")
      .eq("id", agentId)
      .maybeSingle();

    if (!agent) { logger.warn({ agentId }, "Agent not found"); return; }
    if ((agent.status as string) !== "live") { logger.warn({ agentId }, "Agent not live"); return; }

    const ownerId = (agent.user_id as string) || deployOwner;
    const agentName = (agent.name as string | null) ?? null;

    // Rate limits
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    if (!checkIpRateLimit(clientIp).allowed) return;

    const ownerPlan = await getUserPlan(ownerId).catch(() => "free");
    if (!checkAgentDailyLimit(agentId, ownerPlan).allowed) return;
    incrementAgentDailyCount(agentId);

    const customerId = chatId;
    if (!checkCustomerDailyLimit(agentId, customerId, ownerPlan).allowed) return;
    const burst = checkBurstLimit(agentId, customerId);
    if (!burst.allowed) return;
    if (isDuplicateMessage(agentId, customerId, text)) return;
    if (isAiCooldownActive(agentId, customerId)) return;
    incrementCustomerDailyCount(agentId, customerId);
    setAiCooldown(agentId, customerId);

    // Find or create conversation
    const { data: existingConv } = await sb
      .from("conversations")
      .select("id, mode, unread_count")
      .eq("agent_id", agentId)
      .eq("channel", "telegram")
      .eq("channel_conversation_id", chatId)
      .maybeSingle();

    let conversationId: string;
    const currentMode = existingConv ? (existingConv as { mode: string }).mode : "ai";

    if (existingConv) {
      conversationId = (existingConv as { id: string }).id;
      await sb.from("conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 75),
        unread_count: (existingConv as { unread_count: number }).unread_count + 1,
        status: "active",
        deleted_at: null,
      }).eq("id", conversationId);
    } else {
      const { data: newConv, error: convErr } = await sb
        .from("conversations")
        .insert({
          agent_id: agentId,
          agent_name: agentName,
          owner_id: ownerId,
          channel: "telegram",
          channel_conversation_id: chatId,
          customer_display: `Telegram ${chatId}`,
          mode: "ai",
          status: "active",
          unread_count: 1,
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 75),
        })
        .select("id")
        .single();
      if (convErr || !newConv) {
        logger.error({ err: convErr, agentId }, "Failed to create Telegram conversation");
        return;
      }
      conversationId = (newConv as { id: string }).id;
    }

    // Save customer message
    await sb.from("messages").insert({
      conversation_id: conversationId,
      role: "customer",
      content: text,
    });

    if (currentMode === "human") {
      logger.info({ agentId, chatId }, "Telegram in human mode — AI reply suppressed");
      return;
    }

    // Enqueue to worker
    await enqueueMessage({
      agentId,
      conversationId,
      channel: "telegram",
      message: text,
      timestamp: new Date().toISOString(),
    });
    logger.info({ agentId, chatId, conversationId }, "Telegram message enqueued");

  } catch (err) {
    logger.error({ err, agentId }, "Telegram webhook handler error");
  }
});

// ─── POST /api/telegram/setup ────────────────────────────────────────────────

router.post("/telegram/setup", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId, botToken } = req.body as { agentId?: string; botToken?: string };
  if (!agentId?.trim() || !botToken?.trim()) {
    res.status(400).json({ error: "agentId and botToken are required" }); return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const ownership = await verifyAgentOwnership(agentId.trim(), userId, sb);
  if (!ownership.ok) {
    res.status(403).json({ error: "You do not own this agent or it does not exist" }); return;
  }

  const exclusivity = await checkChannelExclusivity(agentId.trim(), "telegram", sb);
  if (exclusivity.blocked) {
    res.status(409).json({
      error: "AGENT_ALREADY_DEPLOYED",
      message: `This agent is already deployed to ${exclusivity.existingChannel}.`,
      existingChannel: exclusivity.existingChannel,
    }); return;
  }

  const encryptedToken = encrypt(botToken.trim());
  await sb.from("telegram_deployments").delete().eq("agent_id", agentId.trim()).eq("user_id", userId);

  const { data, error } = await sb
    .from("telegram_deployments")
    .insert({
      agent_id: agentId.trim(),
      user_id: userId,
      bot_token: encryptedToken,
      status: "active",
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    req.log.error({ err: error }, "Failed to save Telegram deployment");
    res.status(500).json({ error: "Failed to save: " + error.message }); return;
  }

  req.log.info({ agentId }, "Telegram deployment saved");
  res.json({ success: true, deployment: data });
});

// ─── GET /api/telegram/deployment/:agentId ───────────────────────────────────

router.get("/telegram/deployment/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data } = await sb
    .from("telegram_deployments")
    .select("id, status, created_at")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  res.json({ deployment: data ?? null });
});

// ─── DELETE /api/telegram/deployment/:agentId ────────────────────────────────

router.delete("/telegram/deployment/:agentId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  await sb.from("telegram_deployments").delete().eq("agent_id", agentId).eq("user_id", userId);

  req.log.info({ agentId }, "Telegram deployment disconnected");
  res.json({ success: true });
});

export default router;
