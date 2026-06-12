import { createRequire } from "node:module";
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
  checkAgentDailyLimit, incrementAgentDailyCount, checkIpRateLimit, FRIENDLY_LIMIT_MESSAGE,
  checkCustomerDailyLimit, incrementCustomerDailyCount, checkBurstLimit,
  isDuplicateMessage, isAiCooldownActive, setAiCooldown,
  CUSTOMER_DAILY_LIMIT_MESSAGE, BURST_LIMIT_MESSAGE, DUPLICATE_MESSAGE, COOLDOWN_MESSAGE,
} from "../lib/agentLimits.js";
import { getUserPlan } from "../lib/planLimits.js";
import { verifyAgentOwnership, checkChannelExclusivity } from "../lib/channelGuard.js";
import { encrypt, decrypt, isEncrypted } from "../lib/encryption.js";
import { sendWhatsAppMessage } from "../lib/whatsappClient.js";
import { verifyMetaSignature } from "../lib/metaSignature.js";
import { transcribeAudio } from "../lib/whisper.js";
import { runAgentTools } from "../lib/toolRunner.js";

const router = Router();

const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buf: Buffer, opts?: object) => Promise<{ text: string }>;
const mammoth  = _require("mammoth")   as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getProviderForModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.includes("llama") || model.includes("mixtral")) return "groq";
  return "openai";
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

async function callAI(
  apiKey: string,
  provider: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  switch (provider) {
    case "anthropic": {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
        ],
      });
      const block = response.content[0];
      return block.type === "text" ? block.text : "No response.";
    }
    case "google": {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
      const chat = genModel.startChat({
        history: history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });
      const result = await chat.sendMessage(message);
      return result.response.text();
    }
    case "groq": {
      const client = new Groq({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
      });
      return completion.choices[0]?.message?.content ?? "No response.";
    }
    case "openai":
    default: {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
      });
      return completion.choices[0]?.message?.content ?? "No response.";
    }
  }
}

async function callAIVision(
  apiKey: string, provider: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string,
  imageBase64: string, imageMimeType: string
): Promise<string> {
  switch (provider) {
    case "anthropic": {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model, max_tokens: 1024, system: systemPrompt,
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user",
            content: [
              { type: "image" as const, source: { type: "base64" as const, media_type: imageMimeType as "image/jpeg"|"image/png"|"image/gif"|"image/webp", data: imageBase64 } },
              { type: "text" as const, text: message },
            ],
          },
        ],
      });
      const block = response.content[0];
      return block.type === "text" ? block.text : "No response.";
    }
    case "google": {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
      const chat = genModel.startChat({
        history: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      });
      const result = await chat.sendMessage([
        { text: message },
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
      ]);
      return result.response.text();
    }
    case "groq":
      return callAI(apiKey, provider, model, systemPrompt, history, `[User sent an image]\n\n${message}`.trim());
    case "openai":
    default: {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: [
            { type: "text" as const, text: message },
            { type: "image_url" as const, image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          ]},
        ],
      });
      return completion.choices[0]?.message?.content ?? "No response.";
    }
  }
}

async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const infoRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return null;
    const info = await infoRes.json() as { url?: string; mime_type?: string };
    if (!info.url) return null;
    const mediaRes = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!mediaRes.ok) return null;
    return { buffer: Buffer.from(await mediaRes.arrayBuffer()), mimeType: info.mime_type ?? "application/octet-stream" };
  } catch { return null; }
}

// ─── GET /api/whatsapp/webhook/:agentId ────────────────────────────────

router.get("/whatsapp/webhook/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;

  if (mode !== "subscribe" || !token || !challenge) {
    res.status(400).send("Bad Request");
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).send("Service unavailable"); return; }

  const { data: deployment } = await sb
    .from("whatsapp_deployments")
    .select("verify_token")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  if (!deployment || (deployment as { verify_token: string }).verify_token !== token) {
    logger.warn({ agentId }, "WhatsApp webhook verification failed — token mismatch");
    res.status(403).send("Forbidden");
    return;
  }

  logger.info({ agentId }, "WhatsApp webhook verified by Meta");
  res.status(200).send(challenge);
});

// ─── POST /api/whatsapp/webhook/:agentId ──────────────────────────

router.post("/whatsapp/webhook/:agentId", async (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });

  const { agentId } = req.params as { agentId: string };

  const body = req.body as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?:   string;
            type?: string;
            text?:     { body?: string };
            image?:    { id?: string; mime_type?: string; caption?: string };
            audio?:    { id?: string; mime_type?: string };
            document?: { id?: string; mime_type?: string; filename?: string };
          }>;
        };
      }>;
    }>;
  };

  if (body.object !== "whatsapp_business_account") return;

  const inbound = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from    = inbound?.from;
  const msgType = inbound?.type;

  const allowedTypes = ["text", "image", "audio", "document"];
  if (!from || !msgType || !allowedTypes.includes(msgType)) return;

  const rawText = inbound?.text?.body ?? inbound?.image?.caption ?? "";
  const text = rawText.trim() ? sanitizeText(rawText.trim()) : "";
  if (rawText.trim() && (!text || detectPromptInjection(text))) {
    logger.warn({ agentId, from }, "WhatsApp message rejected — empty or prompt injection");
    return;
  }

  const sb = getServiceClient();
  if (!sb) return;

  try {
    // ── Load deployment ──
    const { data: dep } = await sb
      .from("whatsapp_deployments")
      .select("phone_number_id, access_token, app_secret, user_id")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .maybeSingle();

    if (!dep) {
      logger.warn({ agentId }, "No active WhatsApp deployment for webhook — ignoring");
      return;
    }

    // ── HMAC-SHA256 signature verification ──
    const rawAppSecret = dep.app_secret as string | null;
    if (rawAppSecret) {
      const appSecret = isEncrypted(rawAppSecret) ? decrypt(rawAppSecret) : rawAppSecret;
      if (!verifyMetaSignature(req, appSecret)) {
        logger.warn({ agentId }, "WhatsApp signature verification failed — request rejected");
        return;
      }
    } else {
      logger.warn({ agentId }, "WhatsApp app_secret not set — skipping signature verification");
    }

    const phoneNumberId  = dep.phone_number_id as string;
    const rawToken       = dep.access_token as string;
    const accessToken    = isEncrypted(rawToken) ? decrypt(rawToken) : rawToken;
    const deployOwnerId  = dep.user_id as string;

    // ── Load agent ──
    const { data: agent, error: agentErr } = await sb
      .from("agents")
      .select("model, instructions, user_id, name, status")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr) { logger.warn({ agentId, err: agentErr }, "DB error fetching agent for WhatsApp webhook"); return; }
    if (!agent) { logger.warn({ agentId }, "Agent not found for WhatsApp webhook"); return; }
    if ((agent.status as string) !== "live") { logger.warn({ agentId }, "Agent not live for WhatsApp webhook"); return; }

    const model       = (agent.model        as string) || "gpt-4o-mini";
    const instructions = (agent.instructions as string) || "You are a helpful assistant.";
    const agentName   = (agent.name          as string | null) ?? null;
    const ownerId     = (agent.user_id       as string) || deployOwnerId;
    const provider    = getProviderForModel(model);

    // ── MESSAGE LIMITS (same as public chat) ──
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const ipCheck = checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      logger.warn({ ip: clientIp, agentId }, "WhatsApp IP rate limit hit");
      return;
    }

    const ownerPlan = await getUserPlan(ownerId).catch(() => "free");
    const dailyCheck = checkAgentDailyLimit(agentId, ownerPlan);
    if (!dailyCheck.allowed) {
      logger.warn({ agentId, ownerPlan, dailyCount: dailyCheck.count }, "WhatsApp agent daily limit reached");
      return;
    }
    incrementAgentDailyCount(agentId);

    // ── PER-CUSTOMER ANTI-SPAM ──
    const customerId = from;
    const customerDaily = checkCustomerDailyLimit(agentId, customerId, ownerPlan);
    if (!customerDaily.allowed) {
      logger.warn({ agentId, customerId, count: customerDaily.count }, "WhatsApp customer daily limit reached");
      await sendWhatsAppMessage(phoneNumberId, accessToken, from, CUSTOMER_DAILY_LIMIT_MESSAGE);
      return;
    }
    const burstCheck = checkBurstLimit(agentId, customerId);
    if (!burstCheck.allowed) {
      logger.warn({ agentId, customerId, count: burstCheck.count }, "WhatsApp burst limit hit");
      await sendWhatsAppMessage(phoneNumberId, accessToken, from, BURST_LIMIT_MESSAGE);
      return;
    }
    if (isDuplicateMessage(agentId, customerId, text)) {
      logger.warn({ agentId, customerId }, "WhatsApp duplicate message");
      await sendWhatsAppMessage(phoneNumberId, accessToken, from, DUPLICATE_MESSAGE);
      return;
    }
    if (isAiCooldownActive(agentId, customerId)) {
      logger.warn({ agentId, customerId }, "WhatsApp AI cooldown active");
      await sendWhatsAppMessage(phoneNumberId, accessToken, from, COOLDOWN_MESSAGE);
      return;
    }
    incrementCustomerDailyCount(agentId, customerId);
    setAiCooldown(agentId, customerId);

    // ── Download and process media attachments ──────────────────────────────
    const caps: { images?: boolean; voice?: boolean; files?: boolean } = {};
    let mediaText    = "";
    let imageBase64: string | null = null;
    let imageMime:   string | null = null;

    if (msgType === "audio" && caps.voice && inbound?.audio?.id) {
      const dl = await downloadWhatsAppMedia(inbound.audio.id, accessToken);
      if (dl) {
        try {
          const transcript = await transcribeAudio(dl.buffer, dl.mimeType, undefined);
          if (transcript.trim()) mediaText = `[Voice note]: "${transcript.trim()}"`;
        } catch { /* skip if Whisper not configured */ }
      }
    } else if (msgType === "image" && caps.images && inbound?.image?.id) {
      const dl = await downloadWhatsAppMedia(inbound.image.id, accessToken);
      if (dl) {
        imageBase64 = dl.buffer.toString("base64");
        imageMime   = dl.mimeType.startsWith("image/") ? dl.mimeType : "image/jpeg";
      }
    } else if (msgType === "document" && caps.files && inbound?.document?.id) {
      const dl = await downloadWhatsAppMedia(inbound.document.id, accessToken);
      if (dl) {
        const mt = dl.mimeType;
        const fname = inbound.document.filename ?? "file";
        try {
          if (mt === "application/pdf") {
            const parsed = await pdfParse(dl.buffer);
            mediaText = `[Document: ${fname}]:\n${parsed.text.slice(0, 4000)}`;
          } else if (mt.includes("word") || mt.includes("officedocument")) {
            const result = await mammoth.extractRawText({ buffer: dl.buffer });
            mediaText = `[Document: ${fname}]:\n${result.value.slice(0, 4000)}`;
          } else if (mt.startsWith("text/")) {
            mediaText = `[Document: ${fname}]:\n${dl.buffer.toString("utf-8").slice(0, 4000)}`;
          }
        } catch { /* skip unreadable docs */ }
      }
    }

    const effectiveText = [text, mediaText].filter(Boolean).join("\n\n") || "[Media message]";
    const previewText   = effectiveText.slice(0, 75);
    // ─────────────────────────────────────────────────────────────────────────

    // ── Find or create conversation ──
    const { data: existingConv } = await sb
      .from("conversations")
      .select("id, mode, unread_count")
      .eq("agent_id", agentId)
      .eq("channel", "whatsapp")
      .eq("channel_conversation_id", from)
      .maybeSingle();

    let conversationId: string;
    const currentMode = existingConv ? (existingConv as { mode: string }).mode : "ai";

    if (existingConv) {
      conversationId = (existingConv as { id: string }).id;
      await sb.from("conversations").update({
        last_message_at:      new Date().toISOString(),
        last_message_preview: previewText,
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
          channel:                 "whatsapp",
          channel_conversation_id: from,
          customer_display:        `+${from}`,
          mode:                    "ai",
          status:                  "active",
          unread_count:            1,
          last_message_at:         new Date().toISOString(),
          last_message_preview:    previewText,
        })
        .select("id")
        .single();
      if (convErr || !newConv) {
        logger.error({ err: convErr, agentId }, "Failed to create WhatsApp conversation");
        return;
      }
      conversationId = (newConv as { id: string }).id;
    }

    // ── Save inbound customer message ──
    await sb.from("messages").insert({
      conversation_id: conversationId,
      role:            "customer",
      content:         effectiveText,
    });

    // ── Human mode: skip AI ──
    if (currentMode === "human") {
      logger.info({ agentId, from }, "WhatsApp in human mode — AI reply suppressed");
      return;
    }

    // ── Load API key ──
    const { data: keyRow } = await sb
      .from("api_keys")
      .select("api_key")
      .eq("user_id", ownerId)
      .eq("provider", provider)
      .maybeSingle();

    if (!keyRow?.api_key) {
      logger.warn({ agentId, provider }, "No API key found for WhatsApp agent — cannot reply");
      return;
    }

    const rawKey = keyRow.api_key as string;
    const apiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey;

    // ── Load history ──
    const { data: historyRows } = await sb
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(40);

    const conversationHistory: ConversationMessage[] = ((historyRows ?? []) as { role: string; content: string }[])
      .reverse()
      .filter((m) => m.role === "customer" || m.role === "ai")
      .slice(0, -1)
      .map((m) => ({
        role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      }));

    // ── Call AI ──
    let reply = imageBase64 && imageMime
      ? await callAIVision(apiKey, provider, model, buildHardenedSystemPrompt(instructions), conversationHistory, effectiveText, imageBase64, imageMime)
      : await callAI(apiKey, provider, model, buildHardenedSystemPrompt(instructions), conversationHistory, effectiveText);

    // ── Save + send reply ──
    await sb.from("messages").insert({
      conversation_id: conversationId,
      role:            "ai",
      content:         reply,
    });
    await sb.from("conversations").update({
      last_message_at:      new Date().toISOString(),
      last_message_preview: reply.slice(0, 75),
    }).eq("id", conversationId);

    await sendWhatsAppMessage(phoneNumberId, accessToken, from, reply);
    void runAgentTools(agentId, conversationId, text, reply, sb)
      .catch((err: unknown) => logger.error({ err, agentId }, "runAgentTools failed"));
    logger.info({ agentId, from }, "WhatsApp AI reply sent");

  } catch (err) {
    logger.error({ err, agentId }, "WhatsApp webhook handler error");
  }
});

// ─── POST /api/whatsapp/setup ──────────────────────────────────────────

router.post("/whatsapp/setup", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId, phoneNumberId, accessToken, verifyToken, displayName, appSecret } = req.body as {
    agentId?:        string;
    phoneNumberId?:  string;
    accessToken?:    string;
    verifyToken?:    string;
    displayName?:    string;
    appSecret?:      string;
  };

  if (!agentId?.trim() || !phoneNumberId?.trim() || !accessToken?.trim() || !verifyToken?.trim()) {
    res.status(400).json({ error: "agentId, phoneNumberId, accessToken, and verifyToken are required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // 1. Verify ownership
  const ownership = await verifyAgentOwnership(agentId.trim(), userId, sb);
  if (!ownership.ok) {
    res.status(403).json({ error: "You do not own this agent or it does not exist" });
    return;
  }

  // 2. Enforce: one agent → one external channel
  const exclusivity = await checkChannelExclusivity(agentId.trim(), "whatsapp", sb);
  if (exclusivity.blocked) {
    res.status(409).json({
      error: "AGENT_ALREADY_DEPLOYED",
      message: `This agent is already deployed to ${exclusivity.existingChannel}. One agent can only be deployed to one external channel (Telegram, WhatsApp, etc.).`,
      existingChannel: exclusivity.existingChannel,
    });
    return;
  }

  const encryptedToken = encrypt(accessToken.trim());

  // 3. Remove any old deployment
  await sb.from("whatsapp_deployments").delete()
    .eq("agent_id", agentId.trim())
    .eq("user_id", userId);

  // 4. Save new deployment
  const { data, error } = await sb
    .from("whatsapp_deployments")
    .insert({
      agent_id:        agentId.trim(),
      user_id:         userId,
      phone_number_id: phoneNumberId.trim(),
      access_token:    encryptedToken,
      verify_token:    verifyToken.trim(),
      display_name:    displayName?.trim() || null,
      app_secret:      appSecret?.trim() ? encrypt(appSecret.trim()) : null,
      status:          "active",
    })
    .select("id, display_name, phone_number_id, status, created_at")
    .single();

  if (error) {
    req.log.error({ err: error }, "Failed to save WhatsApp deployment");
    res.status(500).json({ error: "Failed to save: " + error.message });
    return;
  }

  req.log.info({ agentId, phoneNumberId: agentId.trim() }, "WhatsApp deployment saved");
  res.json({ success: true, deployment: data });
});

// ─── GET /api/whatsapp/deployment/:agentId ────────────────────────────

router.get("/whatsapp/deployment/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data } = await sb
    .from("whatsapp_deployments")
    .select("id, display_name, phone_number_id, status, created_at")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  res.json({ deployment: data ?? null });
});

// ─── DELETE /api/whatsapp/deployment/:agentId ─────────────────────

router.delete("/whatsapp/deployment/:agentId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  await sb.from("whatsapp_deployments").delete()
    .eq("agent_id", agentId)
    .eq("user_id", userId);

  req.log.info({ agentId }, "WhatsApp deployment disconnected");
  res.json({ success: true });
});

export default router;
