import { createHmac } from "node:crypto";
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
  checkAgentDailyLimit, incrementAgentDailyCount, checkSessionLimit, checkIpRateLimit, FRIENDLY_LIMIT_MESSAGE,
  checkCustomerDailyLimit, incrementCustomerDailyCount, checkBurstLimit,
  isDuplicateMessage, isAiCooldownActive, setAiCooldown,
  CUSTOMER_DAILY_LIMIT_MESSAGE, BURST_LIMIT_MESSAGE, DUPLICATE_MESSAGE, COOLDOWN_MESSAGE,
} from "../lib/agentLimits.js";
import { getUserPlan } from "../lib/planLimits.js";
import { verifyAgentOwnership, checkChannelExclusivity } from "../lib/channelGuard.js";
import { buildToolsContext, executeToolsInReply } from "../lib/toolEngine.js";
import { decrypt, isEncrypted } from "../lib/encryption.js";
import { transcribeAudio } from "../lib/whisper.js";

function getWebhookSecret(agentId: string): string {
  const secret = process.env.SESSION_SECRET ?? "everydayai-webhook-secret";
  return createHmac("sha256", secret).update(agentId).digest("hex").slice(0, 64);
}

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

async function downloadTelegramFile(fileId: string, botToken: string): Promise<{ buffer: Buffer } | null> {
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    if (!infoRes.ok) return null;
    const info = await infoRes.json() as { ok: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${info.result.file_path}`);
    if (!fileRes.ok) return null;
    return { buffer: Buffer.from(await fileRes.arrayBuffer()) };
  } catch { return null; }
}

// ─── POST /api/telegram/setup ─────────────────────────────────────────────
// Saves bot credentials and registers the webhook with Telegram.

router.post("/telegram/setup", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { botToken, botUsername, agentId, webhookUrl } = req.body as {
    botToken?: string;
    botUsername?: string;
    agentId?: string;
    webhookUrl?: string;
  };

  if (!botToken?.trim() || !agentId?.trim()) {
    res.status(400).json({ error: "botToken and agentId are required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // 1. Verify the user owns this agent
  const ownership = await verifyAgentOwnership(agentId.trim(), userId, sb);
  if (!ownership.ok) {
    res.status(403).json({ error: "You do not own this agent or it does not exist" });
    return;
  }

  // 2. Enforce: one agent → one external channel
  const exclusivity = await checkChannelExclusivity(agentId.trim(), "telegram", sb);
  if (exclusivity.blocked) {
    res.status(409).json({
      error: "AGENT_ALREADY_DEPLOYED",
      message: `This agent is already deployed to ${exclusivity.existingChannel}. One agent can only be deployed to one external channel (Telegram, WhatsApp, etc.).`,
      existingChannel: exclusivity.existingChannel,
    });
    return;
  }

  // 3. Remove any old deployment for this agent
  await sb
    .from("telegram_deployments")
    .delete()
    .eq("agent_id", agentId.trim())
    .eq("user_id", userId);

  // 4. Save new deployment
  const { data: deployment, error: insertErr } = await sb
    .from("telegram_deployments")
    .insert({
      agent_id:     agentId.trim(),
      user_id:      userId,
      bot_token:    botToken.trim(),
      bot_username: botUsername?.trim() || null,
      status:       "active",
    })
    .select("id, bot_username, status, created_at")
    .single();

  if (insertErr) {
    req.log.error({ err: insertErr }, "failed to save telegram deployment");
    res.status(500).json({ error: "Failed to save deployment: " + insertErr.message });
    return;
  }

  const webhook =
    webhookUrl?.trim() ||
    `${req.protocol}://${req.get("host") ?? ""}/api/telegram/webhook/${agentId.trim()}`;

  const webhookSecret = getWebhookSecret(agentId.trim());

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken.trim()}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhook, secret_token: webhookSecret }),
      }
    );
    const tgData = (await tgRes.json()) as { ok: boolean; description?: string };
    if (!tgData.ok) {
      req.log.warn({ tgData, agentId }, "Telegram setWebhook returned not-ok");
      res.status(400).json({
        error: `Telegram API error: ${tgData.description ?? "unknown error"}. Check that your bot token is correct.`,
      });
      return;
    }
    req.log.info({ agentId, webhook }, "telegram webhook registered");
  } catch (err) {
    req.log.error({ err }, "failed to call Telegram setWebhook");
    res.status(500).json({ error: "Failed to register webhook with Telegram" });
    return;
  }

  res.json({ success: true, deployment });
});

// ─── GET /api/telegram/deployment/:agentId ────────────────────────────

router.get("/telegram/deployment/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data } = await sb
    .from("telegram_deployments")
    .select("id, bot_username, status, created_at")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  res.json({ deployment: data ?? null });
});

// ─── DELETE /api/telegram/deployment/:agentId ─────────────────────

router.delete("/telegram/deployment/:agentId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: deployment } = await sb
    .from("telegram_deployments")
    .select("bot_token")
    .eq("agent_id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (deployment?.bot_token) {
    try {
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/deleteWebhook`,
        { method: "POST" }
      );
    } catch {
      req.log.warn({ agentId }, "failed to delete telegram webhook — continuing");
    }
  }

  await sb.from("telegram_deployments").delete().eq("agent_id", agentId).eq("user_id", userId);
  req.log.info({ agentId }, "telegram deployment disconnected");
  res.json({ success: true });
});

// ─── POST /api/telegram/webhook/:agentId ─────────────────────────
// Receives updates from Telegram, calls the agent, sends a reply.

router.post("/telegram/webhook/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };

  // ── Verify that this request actually came from Telegram ──
  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  const expectedSecret = getWebhookSecret(agentId);
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    res.status(401).json({ ok: false });
    return;
  }

  const update = req.body as {
    message?: {
      chat?: { id?: number | string };
      text?: string;
      photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
      voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
      document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
    };
  };

  res.json({ ok: true });

  const chatId    = update.message?.chat?.id;
  const rawText   = update.message?.text ?? "";
  const hasPhoto    = (update.message?.photo?.length ?? 0) > 0;
  const hasVoice    = !!update.message?.voice;
  const hasDocument = !!update.message?.document;

  if (!chatId || (!rawText.trim() && !hasPhoto && !hasVoice && !hasDocument)) return;

  // ── Sanitize and check for prompt injection ──
  const text = rawText.trim() ? sanitizeText(rawText.trim()) : "";
  if (rawText.trim() && (!text || detectPromptInjection(text))) {
    logger.warn({ agentId, chatId }, "Telegram message rejected (empty or prompt injection)");
    return;
  }

  const sb = getServiceClient();
  if (!sb) return;

  try {
    const { data: deployment } = await sb
      .from("telegram_deployments")
      .select("bot_token, user_id")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .maybeSingle();

    if (!deployment) {
      logger.warn({ agentId }, "no active telegram deployment for webhook");
      return;
    }

    const { data: agent } = await sb
      .from("agents")
      .select("model, instructions, user_id, status, input_capabilities")
      .eq("id", agentId)
      .maybeSingle();

    if (!agent) return;
    if ((agent.status as string) !== "live") {
      logger.warn({ agentId }, "Agent not live — Telegram webhook ignored");
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "⚠️ This agent hasn't been published yet. The owner needs to publish it in the EverydayAI dashboard first.",
          }),
        }
      );
      return;
    }

    const model = (agent.model as string) || "gpt-4o-mini";
    const instructions = (agent.instructions as string) || "You are a helpful assistant.";
    const provider = getProviderForModel(model);
    const ownerId = (agent.user_id as string) || (deployment.user_id as string);

    // ── MESSAGE LIMITS (same as public chat) ──
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const ipCheck = checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      logger.warn({ ip: clientIp, agentId }, "telegram IP rate limit hit");
      return;
    }

    const ownerPlan = await getUserPlan(ownerId).catch(() => "free");
    const dailyCheck = checkAgentDailyLimit(agentId, ownerPlan);
    if (!dailyCheck.allowed) {
      logger.warn({ agentId, ownerPlan, dailyCount: dailyCheck.count }, "telegram agent daily limit reached");
      return;
    }
    incrementAgentDailyCount(agentId);

    // ── PER-CUSTOMER ANTI-SPAM ──
    const customerId = String(chatId);
    const customerDaily = checkCustomerDailyLimit(agentId, customerId, ownerPlan);
    if (!customerDaily.allowed) {
      logger.warn({ agentId, customerId, count: customerDaily.count }, "telegram customer daily limit reached");
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: CUSTOMER_DAILY_LIMIT_MESSAGE }) },
      );
      return;
    }
    const burstCheck = checkBurstLimit(agentId, customerId);
    if (!burstCheck.allowed) {
      logger.warn({ agentId, customerId, count: burstCheck.count }, "telegram burst limit hit");
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: BURST_LIMIT_MESSAGE }) },
      );
      return;
    }
    if (isDuplicateMessage(agentId, customerId, text)) {
      logger.warn({ agentId, customerId }, "telegram duplicate message");
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: DUPLICATE_MESSAGE }) },
      );
      return;
    }
    if (isAiCooldownActive(agentId, customerId)) {
      logger.warn({ agentId, customerId }, "telegram AI cooldown active");
      await fetch(
        `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: COOLDOWN_MESSAGE }) },
      );
      return;
    }
    incrementCustomerDailyCount(agentId, customerId);
    setAiCooldown(agentId, customerId);

    // ── Download and process media attachments ──────────────────────────────
    const caps = (agent.input_capabilities as { images?: boolean; voice?: boolean; files?: boolean } | null) ?? {};
    const botToken = deployment.bot_token as string;
    let mediaText   = "";
    let imageBase64: string | null = null;
    let imageMime:   string | null = null;

    if (hasVoice && caps.voice) {
      const voice = update.message!.voice!;
      const dl = await downloadTelegramFile(voice.file_id, botToken);
      if (dl) {
        try {
          const transcript = await transcribeAudio(dl.buffer, voice.mime_type ?? "audio/ogg", undefined);
          if (transcript.trim()) mediaText = `[Voice note]: "${transcript.trim()}"`;
        } catch { /* skip if Whisper not configured */ }
      }
    } else if (hasPhoto && caps.images) {
      const photos = update.message!.photo!;
      const largest = photos[photos.length - 1];
      const dl = await downloadTelegramFile(largest.file_id, botToken);
      if (dl) {
        imageBase64 = dl.buffer.toString("base64");
        imageMime   = "image/jpeg";
      }
    } else if (hasDocument && caps.files) {
      const doc = update.message!.document!;
      const dl = await downloadTelegramFile(doc.file_id, botToken);
      if (dl) {
        const mt = doc.mime_type ?? "";
        try {
          if (mt === "application/pdf") {
            const parsed = await pdfParse(dl.buffer);
            mediaText = `[Document: ${doc.file_name ?? "file"}]:\n${parsed.text.slice(0, 4000)}`;
          } else if (mt.includes("word") || mt.includes("officedocument")) {
            const result = await mammoth.extractRawText({ buffer: dl.buffer });
            mediaText = `[Document: ${doc.file_name ?? "file"}]:\n${result.value.slice(0, 4000)}`;
          } else if (mt.startsWith("text/")) {
            mediaText = `[Document: ${doc.file_name ?? "file"}]:\n${dl.buffer.toString("utf-8").slice(0, 4000)}`;
          }
        } catch { /* skip unreadable docs */ }
      }
    }

    const effectiveText = [text, mediaText].filter(Boolean).join("\n\n") || "[Media message]";
    // ─────────────────────────────────────────────────────────────────────────

    const { data: keyRow } = await sb
      .from("api_keys")
      .select("api_key")
      .eq("user_id", ownerId)
      .eq("provider", provider)
      .maybeSingle();

    if (!keyRow?.api_key) {
      logger.warn({ agentId, provider }, "no API key found for telegram webhook agent");
      return;
    }

    const rawApiKey = keyRow.api_key as string;
    const apiKey    = isEncrypted(rawApiKey) ? decrypt(rawApiKey) : rawApiKey;

    // ── Load tools context ──
    const { prompt: toolsPrompt, tools: agentTools } = await buildToolsContext(agentId, sb);

    let reply = imageBase64 && imageMime
      ? await callAIVision(apiKey, provider, model, buildHardenedSystemPrompt(instructions + toolsPrompt), [], effectiveText, imageBase64, imageMime)
      : await callAI(apiKey, provider, model, buildHardenedSystemPrompt(instructions + toolsPrompt), [], effectiveText);

    // ── Execute any tool calls the AI emitted ──
    const { reply: cleanedReply } = await executeToolsInReply(reply, agentTools, ownerId, sb);
    reply = cleanedReply;

    await fetch(
      `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply }),
      }
    );

    logger.info({ agentId, chatId, toolCount: agentTools.length }, "telegram webhook reply sent");
  } catch (err) {
    logger.error({ err, agentId }, "telegram webhook handler error");
  }
});

export default router;
