import { Router } from "express";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger.js";
import { sanitizeText, validateMessageLength, detectPromptInjection } from "../lib/sanitize.js";
import { checkPlanLimit } from "../lib/planLimits.js";
import { KeyResolutionService } from "../services/KeyResolutionService.js";
import { SupabaseKeyRepository } from "../adapters/SupabaseKeyRepository.js";
import { SupabaseAgentRepository } from "../adapters/SupabaseAgentRepository.js";
import { getServiceClient } from "../lib/supabaseService.js";
import { enqueueMessage } from "../lib/queue.js";

const router = Router();

router.post("/test-chat", async (req: Request, res: Response) => {
  const verifiedUserId = req.user?.id ?? null;
  const { message, agentId } = req.body as {
    message?: string;
    agentId?: string;
  };

  if (!message?.trim() || !agentId?.trim()) {
    res.status(400).json({ error: "message and agentId are required" });
    return;
  }

  const cleanMessage = sanitizeText(message.trim());
  if (!validateMessageLength(cleanMessage, 4000)) {
    res.status(400).json({ error: "Message is too long. Maximum 4000 characters allowed." });
    return;
  }

  if (detectPromptInjection(cleanMessage)) {
    req.log.warn({ agentId }, "prompt injection detected in test chat");
    res.status(400).json({ error: "Message contains invalid content." });
    return;
  }

  // Plan limit check for authenticated users
  if (verifiedUserId) {
    const limitResult = await checkPlanLimit(verifiedUserId);
    if (!limitResult.allowed) {
      res.status(402).json({
        error: "MESSAGE_LIMIT_REACHED",
        message: limitResult.message,
        current: limitResult.current,
        limit: limitResult.limit,
      });
      return;
    }
  }

  const sb = getServiceClient();
  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const keyService = new KeyResolutionService(
    new SupabaseKeyRepository(sb as any),
    new SupabaseAgentRepository(sb as any)
  );

  // Resolve the key (authenticated owner or public fallback)
  const keyResult = verifiedUserId
    ? await keyService.resolveForStudio(verifiedUserId, agentId.trim(), "", "gpt-4o-mini", "")
    : await keyService.resolveForPublic(agentId.trim(), "", "gpt-4o-mini", "");

  if (!keyResult.ok) {
    if (keyResult.reason === "NO_API_KEY") {
      res.status(400).json({ error: "NO_API_KEY", provider: keyResult.provider });
    } else if (keyResult.reason === "AGENT_NOT_FOUND") {
      res.status(404).json({ error: "Agent not found or not published" });
    } else {
      res.status(403).json({ error: "Not authorized for this agent" });
    }
    return;
  }

  // Create a new conversation
  const conversationId = uuidv4();

  const { data: agentRow } = await sb
    .from("agents")
    .select("user_id, name")
    .eq("id", agentId.trim())
    .maybeSingle();
  const ownerId = agentRow ? (agentRow as { user_id: string }).user_id : "";
  const agentName = agentRow ? (agentRow as { name: string }).name : null;

  await sb.from("conversations").insert({
    id: conversationId,
    agent_id: agentId.trim(),
    agent_name: agentName,
    owner_id: ownerId,
    channel: "test",
    channel_conversation_id: conversationId,
    customer_display: "Test session",
    mode: "ai",
    status: "active",
    unread_count: 0,
    last_message_at: new Date().toISOString(),
    last_message_preview: cleanMessage.slice(0, 75),
  });

  // Save user message
  await sb.from("messages").insert({
    conversation_id: conversationId,
    role: "customer",
    content: cleanMessage,
  });

  // Enqueue with fully resolved credentials — no more re‑resolution
  await enqueueMessage({
    agentId: agentId.trim(),
    conversationId,
    channel: "test",
    message: cleanMessage,
    timestamp: new Date().toISOString(),
    ownerUserId: verifiedUserId ?? ownerId,
    resolvedApiKey: keyResult.apiKey,
    resolvedProvider: keyResult.provider,
    resolvedModel: keyResult.model,
    resolvedInstructions: keyResult.instructions,
  });

  logger.info({ agentId, conversationId, verifiedUserId }, "Test chat message enqueued (pre‑resolved)");

  res.json({ conversationId });
});

export default router;
