// ─── OpenAIProvider.ts ────────────────────────────────────────────
// ADAPTER: OpenAI Provider
//
// WHY this exists:
// → Real implementation of ILLMProvider for OpenAI
// → Handles text chat and vision (image input)
// → 30 second timeout built in
// → Retries once on failure before throwing
// → Throws typed LLMError — never generic messages
//
// MODELS SUPPORTED:
// → gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
// ──────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { ILLMProvider, LLMRequest, LLMResponse } from "../ports/ILLMProvider.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { logger } from "../lib/logger.js";

// 30 seconds — if OpenAI takes longer something is wrong
const TIMEOUT_MS = 30_000;

export class OpenAIProvider implements ILLMProvider {

  async chat(request: LLMRequest): Promise<LLMResponse> {
    // Try once — if fails retry once — if still fails throw
    return this.callWithRetry(request, 1);
  }

  private async callWithRetry(
    request: LLMRequest,
    attemptsLeft: number
  ): Promise<LLMResponse> {
    try {
      const reply = request.image
        ? await this.callVision(request)
        : await this.callText(request);

      return { reply };

    } catch (err) {
      // If it is already a typed LLMError — don't retry
      // It means key is wrong or rate limited — retrying won't help
      if (err instanceof LLMError) throw err;

      if (attemptsLeft > 0) {
        logger.warn({ err }, "OpenAIProvider: attempt failed, retrying once");
        await sleep(2000); // wait 2 seconds before retry
        return this.callWithRetry(request, attemptsLeft - 1);
      }

      // Retries exhausted — throw typed error
      throw this.mapError(err);
    }
  }

  private async callText(request: LLMRequest): Promise<string> {
    const client = new OpenAI({
      apiKey: request.apiKey,
      timeout: TIMEOUT_MS,
    });

    const completion = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: "system", content: request.instructions },
        ...request.conversationHistory,
        { role: "user",   content: request.message },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new LLMError("UNKNOWN", "OpenAI returned empty response");
    return reply;
  }

  private async callVision(request: LLMRequest): Promise<string> {
    if (!request.image) throw new LLMError("UNKNOWN", "No image provided");

    const client = new OpenAI({
      apiKey: request.apiKey,
      timeout: TIMEOUT_MS,
    });

    const completion = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: "system", content: request.instructions },
        ...request.conversationHistory,
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${request.image.mimeType};base64,${request.image.base64}`,
              },
            },
            ...(request.message
              ? [{ type: "text" as const, text: request.message }]
              : []),
          ],
        },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new LLMError("UNKNOWN", "OpenAI vision returned empty response");
    return reply;
  }

  private mapError(err: unknown): LLMError {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("api key") || msg.includes("authentication") || msg.includes("401")) {
      return new LLMError("INVALID_KEY", "Invalid OpenAI API key. Check your key in Settings.", err);
    }
    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
      return new LLMError("RATE_LIMIT", "OpenAI rate limit exceeded. Try again shortly.", err);
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new LLMError("TIMEOUT", "OpenAI took too long to respond. Try again.", err);
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("unavailable")) {
      return new LLMError("PROVIDER_DOWN", "OpenAI is temporarily unavailable.", err);
    }

    logger.error({ err }, "OpenAIProvider: unmapped error");
    return new LLMError("UNKNOWN", "Failed to get a response from OpenAI.", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
