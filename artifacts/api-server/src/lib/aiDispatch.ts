import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

// ── AI call timeout ────────────────────────────────────────────────────────────
// Hard ceiling on every provider call. If the provider does not respond within
// this window (network hang, provider outage, overload), we reject rather than
// holding a Node.js event-loop slot open indefinitely. Accumulated hung promises
// exhaust the event loop and eventually make the server unresponsive.
const AI_CALL_TIMEOUT_MS = 30_000; // 30 seconds

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} call timed out after ${AI_CALL_TIMEOUT_MS}ms`)),
        AI_CALL_TIMEOUT_MS
      )
    ),
  ]);
}

// ── Max tokens per reply ───────────────────────────────────────────────────────
// Caps every provider at the same ceiling. Without this, OpenAI/Groq/Google can
// return 4K–16K token replies which consume memory, inflate latency, and drive
// unpredictable provider costs. 1024 tokens ≈ 750 words — sufficient for
// conversational AI replies. Anthropic was already capped at 1024.
const MAX_REPLY_TOKENS = 1_024;

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
      const response = await withTimeout(
        client.messages.create({
          model,
          max_tokens: MAX_REPLY_TOKENS,
          system: systemPrompt,
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: message },
          ],
        }),
        "Anthropic"
      );
      const block = response.content[0];
      return block.type === "text" ? block.text : "No response.";
    }
    case "google": {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        generationConfig: { maxOutputTokens: MAX_REPLY_TOKENS },
      });
      const chat = genModel.startChat({
        history: history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });
      const result = await withTimeout(chat.sendMessage(message), "Google");
      return result.response.text();
    }
    case "groq": {
      const client = new Groq({ apiKey });
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          max_tokens: MAX_REPLY_TOKENS,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
          ],
        }),
        "Groq"
      );
      return completion.choices[0]?.message?.content ?? "No response.";
    }
    case "openai":
    default: {
      const client = new OpenAI({ apiKey });
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          max_tokens: MAX_REPLY_TOKENS,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
          ],
        }),
        "OpenAI"
      );
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
      const response = await withTimeout(
        client.messages.create({
          model,
          max_tokens: MAX_REPLY_TOKENS,
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
        }),
        "Anthropic"
      );
      const block = response.content[0];
      return block.type === "text" ? block.text : "No response.";
    }
    case "google": {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        generationConfig: { maxOutputTokens: MAX_REPLY_TOKENS },
      });
      const chat = genModel.startChat({
        history: history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });
      const result = await withTimeout(
        chat.sendMessage([
          { text: message },
          { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
        ]),
        "Google"
      );
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
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          max_tokens: MAX_REPLY_TOKENS,
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
        }),
        "OpenAI"
      );
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
