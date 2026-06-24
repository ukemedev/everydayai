import OpenAI from "openai";
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
// 1024 tokens ≈ 750 words — sufficient for conversational AI replies.
const MAX_REPLY_TOKENS = 1_024;

/**
 * Shared AI dispatch utilities used by every channel webhook handler.
 *
 * v2 supported providers:
 * - OpenAI  — permanent, production provider.
 * - Groq    — temporary, testing only. Remove once OpenAI account is funded.
 *
 * NOTE: this is a separate implementation from LLMService/adapters
 * (the studio/widget chat path). Consolidating the two is a deliberate
 * separate piece of work, not done here.
 */

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function getProviderForModel(model: string): string {
  if (model.includes("llama") || model.includes("mixtral") ||
      model.includes("whisper")) return "groq";
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
  if (provider === "groq") {
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
  // Groq has no vision support — fall back to text-only with a note.
  if (provider === "groq") {
    return callAI(
      apiKey, provider, model, systemPrompt, history,
      `[User sent an image, but this model does not support image input]\n\n${message}`.trim()
    );
  }

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