import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { logger } from "../lib/logger.js";
import { sanitizeText, detectPromptInjection, buildHardenedSystemPrompt } from "../lib/sanitize.js";
import {
  checkAgentDailyLimit, incrementAgentDailyCount, checkIpRateLimit,
  checkCustomerDailyLimit, incrementCustomerDailyCount, checkBurstLimit,
  isDuplicateMessage, isAiCooldownActive, setAiCooldown,
  CUSTOMER_DAILY_LIMIT_MESSAGE, BURST_LIMIT_MESSAGE, DUPLICATE_MESSAGE, COOLDOWN_MESSAGE,
} from "../lib/agentLimits.js";
import { getUserPlan } from "../lib/planLimits.js";
import { verifyAgentOwnership, checkChannelExclusivity } from "../lib/channelGuard.js";
import { buildToolsContext, executeToolsInReply } from "../lib/toolEngine.js";
import { encrypt, decrypt, isEncrypted } from "../lib/encryption.js";
import { sendMetaMessage } from "../lib/metaClient.js";
import { verifyMetaSignature } from "../lib/metaSignature.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getProviderForModel(model: string): string {
  if (model.startsWith("claude-"))  return "anthropic";
  if (model.startsWith("gemini-"))  return "google";
  if (model.includes("llama") || model.includes("mixtral")) return "groq";
  return "openai";
}

interface ConversationMessage { role: "user" | "assistant"; content: string; }

async function callAI(
  apiKey: string, provider: string, model: string,
  systemPrompt: string, history: ConversationMessage[], message: string
): Promise<string> {
  switch (provider) {
    case "anthropic": {
      const c = new Anthropic({ apiKey });
      const r = await c.messages.create({
        model, max_tokens: 1024, system: systemPrompt,
        messages: [...history.map(m => ({ role: m.role, content: m.content })), { role: "user", content: message }],
      });
      const b = r.content[0]; return b.type === "text" ? b.text : "No response.";
    }
    case "google": {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
      const chat = genModel.startChat({ history: history.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) });
      const result = await chat.sendMessage(message);
      return result.response.text();
    }
    case "groq": {
      const c = new Groq({ apiKey });
      const r = await c.chat.completions.create({
        model, messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
      });
      return r.choices[0]?.message?.content ?? "No response.";
    }
    default: {
      const c = new OpenAI({ apiKey });
      const r = await c.chat.completions.create({
        model, messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
      });
      return r.choices[0]?.message?.content ?? "No response.";
    }
  }
}

// ─── GET /api/messenger/webhook/:agentId  (Meta webhook verification) ─────────

router.get("/messenger/webhook/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;

  if (mode !== "subscribe" || !token || !challenge) {
    res.status(400).send("Bad Request"); return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).send("Service unavailable"); return; }

  const { data: dep } = await sb
    .from("messenger_deployments")
    .select("verify_token")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  if (!dep || (dep as { verify_token: string }).verify_token !== token) {
    logger.warn({ agentId }, "Messenger webhook verification failed");
    res.status(403).send("Forbidden"); return;
  }

  logger.info({ agentId }, "Messenger webhook verified by Meta");
  res.status(200).send(challenge);
});

// ─── POST /api/messenger/webhook/:agentId  (inbound messages) ────────────────

router.post("/messenger/webhook/:agentId", async (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });

  const { agentId } = req.params as { agentId: string };

  const body = req.body as {
    object?: string;
    entry?: Array<{
      messaging?: Array<{
        sender?:    { id?: string };
        recipient?: { id?: string };
        message?:   { text?: string; is_echo?: boolean };
      }>;
    }>;
  };

  if (body.object !== "page") return;

  const msg = body.entry?.[0]?.messaging?.[0];
  if (!msg) return;

  // Ignore echo messages (messages sent BY the page)
  if (msg.message?.is_echo) return;

  const senderId = msg.sender?.id;
  const rawText  = msg.message?.text;

  if (!senderId || !rawText?.trim()) return;

  const text = sanitizeText(rawText.trim());
  if (!text || detectPromptInjection(text)) {
    logger.warn({ agentId, senderId }, "Messenger message rejected");
    return;
  }

  const sb = getServiceClient();
  if (!sb) return;

  try {
    const { data: dep } = await sb
      .from("messenger_deployments")
      .select("page_id, access_token, app_secret, user_id")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .maybeSingle();

    if (!dep) { logger.warn({ agentId }, "No active Messenger deployment"); return; }

    // ── HMAC-SHA256 signature verification ──
    const rawAppSecret = dep.app_secret as string | null;
    if (rawAppSecret) {
      const appSecret = isEncrypted(rawAppSecret) ? decrypt(rawAppSecret) : rawAppSecret;
      if (!verifyMetaSignature(req, appSecret)) {
        logger.warn({ agentId }, "Messenger signature verification failed — request rejected");
        return;
      }
    } else {
      logger.warn({ agentId }, "Messenger app_secret not set — skipping signature verification");
    }

    const rawToken    = dep.access_token as string;
    const accessToken = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
    const deployOwner = dep.user_id as string;

    const { data: agent } = await sb
      .from("agents")
      .select("model, instructions, user_id, name, status")
      .eq("id", agentId)
      .maybeSingle();

    if (!agent) { logger.warn({ agentId }, "Agent not found"); return; }
    if ((agent.status as string) !== "live") { logger.warn({ agentId }, "Agent not live"); return; }

    const model        = (agent.model        as string) || "gpt-4o-mini";
    const instructions = (agent.instructions as string) || "You are a helpful assistant.";
    const agentName    = (agent.name          as string | null) ?? null;
    const ownerId      = (agent.user_id       as string) || deployOwner;
    const provider     = getProviderForModel(model);

    // ── Rate limits ──
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    if (!checkIpRateLimit(clientIp).allowed) {
      logger.warn({ agentId }, "Messenger IP rate limit hit"); return;
    }
    const ownerPlan = await getUserPlan(ownerId).catch(() => "free");
    const daily = checkAgentDailyLimit(agentId, ownerPlan);
    if (!daily.allowed) { logger.warn({ agentId }, "Messenger daily limit hit"); return; }
    incrementAgentDailyCount(agentId);

    // ── PER-CUSTOMER ANTI-SPAM ──
    const customerId = senderId;
    const customerDaily = checkCustomerDailyLimit(agentId, customerId, ownerPlan);
    if (!customerDaily.allowed) {
      logger.warn({ agentId, customerId, count: customerDaily.count }, "Messenger customer daily limit reached");
      await sendMetaMessage(accessToken, senderId, CUSTOMER_DAILY_LIMIT_MESSAGE);
      return;
    }
    const burstCheck = checkBurstLimit(agentId, customerId);
    if (!burstCheck.allowed) {
      logger.warn({ agentId, customerId, count: burstCheck.count }, "Messenger burst limit hit");
      await sendMetaMessage(accessToken, senderId, BURST_LIMIT_MESSAGE);
      return;
    }
    if (isDuplicateMessage(agentId, customerId, text)) {
      logger.warn({ agentId, customerId }, "Messenger duplicate message");
      await sendMetaMessage(accessToken, senderId, DUPLICATE_MESSAGE);
      return;
    }
    if (isAiCooldownActive(agentId, customerId)) {
      logger.warn({ agentId, customerId }, "Messenger AI cooldown active");
      await sendMetaMessage(accessToken, senderId, COOLDOWN_MESSAGE);
      return;
    }
    incrementCustomerDailyCount(agentId, customerId);
    setAiCooldown(agentId, customerId);

    // ── Find or create conversation ──
    const { data: existingConv } = await sb
      .from("conversations")
      .select("id, mode, unread_count")
      .eq("agent_id", agentId)
      .eq("channel", "messenger")
      .eq("channel_conversation_id", senderId)
      .maybeSingle();

    let conversationId: string;
    const currentMode = existingConv ? (existingConv as { mode: string }).mode : "ai";

    if (existingConv) {
      conversationId = (existingConv as { id: string }).id;
      await sb.from("conversations").update({
        last_message_at:      new Date().toISOString(),
        last_message_preview: text.slice(0, 75),
        unread_count:         (existingConv as { unread_count: number }).unread_count + 1,
        status: "active",
      }).eq("id", conversationId);
    } else {
      const { data: newConv, error: convErr } = await sb
        .from("conversations")
        .insert({
          agent_id:                agentId,
          agent_name:              agentName,
          owner_id:                ownerId,
          channel:                 "messenger",
          channel_conversation_id: senderId,
          customer_display:        `Messenger user ${senderId.slice(-6)}`,
          mode:                    "ai",
          status:                  "active",
          unread_count:            1,
          last_message_at:         new Date().toISOString(),
          last_message_preview:    text.slice(0, 75),
        })
        .select("id")
        .single();
      if (convErr || !newConv) {
        logger.error({ err: convErr, agentId }, "Failed to create Messenger conversation"); return;
      }
      conversationId = (newConv as { id: string }).id;
    }

    await sb.from("messages").insert({ conversation_id: conversationId, role: "customer", content: text });

    if (currentMode === "human") {
      logger.info({ agentId }, "Messenger in human mode — AI reply suppressed"); return;
    }

    const { data: keyRow } = await sb
      .from("api_keys")
      .select("api_key")
      .eq("user_id", ownerId)
      .eq("provider", provider)
      .maybeSingle();

    if (!keyRow?.api_key) { logger.warn({ agentId, provider }, "No API key"); return; }
    const apiKey = isEncrypted(keyRow.api_key as string) ? decrypt(keyRow.api_key as string) : keyRow.api_key as string;

    const { data: historyRows } = await sb
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(40);

    const history: ConversationMessage[] = ((historyRows ?? []) as { role: string; content: string }[])
      .reverse()
      .filter(m => m.role === "customer" || m.role === "ai")
      .slice(0, -1)
      .map(m => ({ role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant", content: m.content }));

    // ── Load tools context ──
    const { prompt: toolsPrompt, tools: agentTools } = await buildToolsContext(agentId, sb);

    let reply = await callAI(apiKey, provider, model, buildHardenedSystemPrompt(instructions + toolsPrompt), history, text);

    // ── Execute any tool calls the AI emitted ──
    const { reply: cleanedReply } = await executeToolsInReply(reply, agentTools, ownerId, sb);
    reply = cleanedReply;

    await sb.from("messages").insert({ conversation_id: conversationId, role: "ai", content: reply });
    await sb.from("conversations").update({
      last_message_at: new Date().toISOString(), last_message_preview: reply.slice(0, 75),
    }).eq("id", conversationId);

    await sendMetaMessage(accessToken, senderId, reply);
    logger.info({ agentId, senderId, toolCount: agentTools.length }, "Messenger AI reply sent");

  } catch (err) {
    logger.error({ err, agentId }, "Messenger webhook handler error");
  }
});

// ─── POST /api/messenger/setup ────────────────────────────────────────────────

router.post("/messenger/setup", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId, pageId, pageName, accessToken, verifyToken, appSecret } = req.body as {
    agentId?:     string;
    pageId?:      string;
    pageName?:    string;
    accessToken?: string;
    verifyToken?: string;
    appSecret?:   string;
  };

  if (!agentId?.trim() || !pageId?.trim() || !accessToken?.trim() || !verifyToken?.trim()) {
    res.status(400).json({ error: "agentId, pageId, accessToken, and verifyToken are required" }); return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const ownership = await verifyAgentOwnership(agentId.trim(), userId, sb);
  if (!ownership.ok) {
    res.status(403).json({ error: "You do not own this agent or it does not exist" }); return;
  }

  const exclusivity = await checkChannelExclusivity(agentId.trim(), "messenger", sb);
  if (exclusivity.blocked) {
    res.status(409).json({
      error: "AGENT_ALREADY_DEPLOYED",
      message: `This agent is already deployed to ${exclusivity.existingChannel}. One agent can only be deployed to one external channel.`,
      existingChannel: exclusivity.existingChannel,
    });
    return;
  }

  const encryptedToken = encrypt(accessToken.trim());

  await sb.from("messenger_deployments").delete()
    .eq("agent_id", agentId.trim()).eq("user_id", userId);

  const { data, error } = await sb
    .from("messenger_deployments")
    .insert({
      agent_id:     agentId.trim(),
      user_id:      userId,
      page_id:      pageId.trim(),
      page_name:    pageName?.trim() || null,
      access_token: encryptedToken,
      verify_token: verifyToken.trim(),
      app_secret:   appSecret?.trim() ? encrypt(appSecret.trim()) : null,
      status:       "active",
    })
    .select("id, page_id, page_name, status, created_at")
    .single();

  if (error) {
    req.log.error({ err: error }, "Failed to save Messenger deployment");
    res.status(500).json({ error: "Failed to save: " + error.message }); return;
  }

  req.log.info({ agentId, pageId }, "Messenger deployment saved");
  res.json({ success: true, deployment: data });
});

// ─── GET /api/messenger/deployment/:agentId ───────────────────────────────────

router.get("/messenger/deployment/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data } = await sb
    .from("messenger_deployments")
    .select("id, page_id, page_name, status, created_at")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  res.json({ deployment: data ?? null });
});

// ─── DELETE /api/messenger/deployment/:agentId ────────────────────────────────

router.delete("/messenger/deployment/:agentId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  await sb.from("messenger_deployments").delete()
    .eq("agent_id", agentId).eq("user_id", userId);

  req.log.info({ agentId }, "Messenger deployment disconnected");
  res.json({ success: true });
});

export default router;
