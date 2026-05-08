import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { logger } from "../lib/logger.js";

const router = Router();

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

// ─── POST /api/telegram/setup ─────────────────────────────────────────────────
// Saves bot credentials and registers the webhook with Telegram.

router.post("/telegram/setup", async (req: Request, res: Response) => {
  const { botToken, botUsername, agentId, userId, webhookUrl } = req.body as {
    botToken?: string;
    botUsername?: string;
    agentId?: string;
    userId?: string;
    webhookUrl?: string;
  };

  if (!botToken?.trim() || !agentId?.trim() || !userId?.trim()) {
    res.status(400).json({ error: "botToken, agentId, and userId are required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  await sb
    .from("telegram_deployments")
    .delete()
    .eq("agent_id", agentId.trim())
    .eq("user_id", userId.trim());

  const { data: deployment, error: insertErr } = await sb
    .from("telegram_deployments")
    .insert({
      agent_id: agentId.trim(),
      user_id: userId.trim(),
      bot_token: botToken.trim(),
      bot_username: botUsername?.trim() || null,
      status: "active",
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

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken.trim()}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhook }),
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

// ─── GET /api/telegram/deployment/:agentId ────────────────────────────────────

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

// ─── DELETE /api/telegram/deployment/:agentId ─────────────────────────────────

router.delete("/telegram/deployment/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: deployment } = await sb
    .from("telegram_deployments")
    .select("bot_token")
    .eq("agent_id", agentId)
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

  await sb.from("telegram_deployments").delete().eq("agent_id", agentId);
  req.log.info({ agentId }, "telegram deployment disconnected");
  res.json({ success: true });
});

// ─── POST /api/telegram/webhook/:agentId ─────────────────────────────────────
// Receives updates from Telegram, calls the agent, sends a reply.

router.post("/telegram/webhook/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const update = req.body as {
    message?: {
      chat?: { id?: number | string };
      text?: string;
    };
  };

  res.json({ ok: true });

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;

  if (!chatId || !text?.trim()) return;

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
      .select("model, instructions, user_id")
      .eq("id", agentId)
      .maybeSingle();

    if (!agent) return;

    const model = (agent.model as string) || "gpt-4o-mini";
    const instructions = (agent.instructions as string) || "You are a helpful assistant.";
    const provider = getProviderForModel(model);
    const ownerId = (agent.user_id as string) || (deployment.user_id as string);

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

    const reply = await callAI(
      keyRow.api_key as string,
      provider,
      model,
      instructions,
      [],
      text.trim()
    );

    await fetch(
      `https://api.telegram.org/bot${deployment.bot_token as string}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply }),
      }
    );

    logger.info({ agentId, chatId }, "telegram webhook reply sent");
  } catch (err) {
    logger.error({ err, agentId }, "telegram webhook handler error");
  }
});

export default router;
