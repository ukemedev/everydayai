import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

/**
 * Shared AI dispatch utilities used by every channel webhook handler.
 *
 * Having one canonical implementation means a fix here propagates to
 * Telegram, WhatsApp, Messenger, Instagram and the web chat immediately —
 * no more copy-paste drift across route files.
 */

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function getProviderForModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.includes("llama") || model.includes("mixtral")) return "groq";
  return "openai";
}

export async function callAI(
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

export async function callAIVision(
  apiKey: string,
  provider: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string,
  imageBase64: string,
  imageMimeType: string
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
          {
            role: "user",
            content: [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: imageMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: imageBase64,
                },
              },
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
        history: history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });
      const result = await chat.sendMessage([
        { text: message },
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
      ]);
      return result.response.text();
    }
    case "groq":
      return callAI(
        apiKey, provider, model, systemPrompt, history,
        `[User sent an image]\n\n${message}`.trim()
      );
    case "openai":
    default: {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          {
            role: "user",
            content: [
              { type: "text" as const, text: message },
              {
                type: "image_url" as const,
                image_url: { url: `data:${imageMimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      });
      return completion.choices[0]?.message?.content ?? "No response.";
    }
  }
}

/**
 * Telegram sendMessage has a hard 4096-character limit.
 * Truncate AI replies before sending to avoid a silent 400 from the Bot API.
 */
export const TELEGRAM_MAX_MSG_LEN = 4096;

export function truncateForTelegram(text: string): string {
  if (text.length <= TELEGRAM_MAX_MSG_LEN) return text;
  return text.slice(0, TELEGRAM_MAX_MSG_LEN - 1) + "…";
}
