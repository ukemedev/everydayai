import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

const router = Router();

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  message?: string;
  instructions?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  conversationHistory?: ConversationMessage[];
  agentId?: string;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
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
  return block.type === "text" ? block.text : "No response from model.";
}

async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });
  const chat = genModel.startChat({
    history: history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, provider, apiKey, conversationHistory } =
    req.body as ChatBody;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const resolvedModel = model?.trim() || "gpt-4o-mini";
  const resolvedProvider = provider?.trim() || "openai";
  const systemPrompt = instructions?.trim() || "You are a helpful assistant.";
  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? conversationHistory
    : [];

  req.log.info(
    { provider: resolvedProvider, model: resolvedModel, historyLength: history.length },
    "chat request received"
  );

  try {
    let reply: string;

    switch (resolvedProvider) {
      case "anthropic":
        reply = await callAnthropic(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "google":
        reply = await callGoogle(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "groq":
        reply = await callGroq(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "openai":
      default:
        reply = await callOpenAI(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
    }

    req.log.info({ provider: resolvedProvider, model: resolvedModel }, "chat completion successful");
    res.json({ reply });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, provider: resolvedProvider, model: resolvedModel }, "chat completion failed");

    if (errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("authentication") || errMsg.toLowerCase().includes("401")) {
      res.status(401).json({ error: "Invalid API key. Please check your key in Settings." });
    } else if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("429")) {
      res.status(429).json({ error: "Rate limit or quota exceeded. Try again later." });
    } else {
      res.status(500).json({ error: "Failed to get a response. Please try again." });
    }
  }
});

export default router;
