// ─── GroqProvider.ts ──────────────────────────────────────────────
// ADAPTER: Groq Provider
//
// WHY this exists:
// → Real implementation of ILLMProvider for Groq
// → TEXT ONLY — Groq does not support vision
// → If image is sent → returns polite message instead of crashing
// → 30 second timeout built in
// → Retries once on failure before throwing
// → Throws typed LLMError — never generic messages
//
// MODELS SUPPORTED:
// → llama-3.3-70b-versatile
// → llama-3.1-8b-instant
// → mixtral-8x7b-32768
// ──────────────────────────────────────────────────────────────────

import Groq from "groq-sdk";
import type { ILLMProvider, LLMRequest, LLMResponse } from "../ports/ILLMProvider.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { logger } from "../lib/logger.js";

const TIMEOUT_MS = 30_000;

// Shown to customer when they send image to Groq model
// Groq does not support vision — handle gracefully
const VISION_FALLBACK =
  "I can see you sent an image, but the current AI model does not support image analysis. " +
  "Please switch to GPT-4o or Claude to process images.";

export class GroqProvider implements ILLMProvider {

  async chat(request: LLMRequest): Promise<LLMResponse> {
    // Groq has no vision support
    // Return friendly message instead of crashing
    if (request.image) {
      logger.info("GroqProvider: image sent but Groq has no vision — returning fallback");
      return { reply: VISION_FALLBACK };
    }

    return this.callWithRetry(request, 1);
  }

  private async callWithRetry(
    request: LLMRequest,
    attemptsLeft: number
  ): Promise<LLMResponse> {
    try {
      const reply = await this.callText(request);
      return { reply };

    } catch (err) {
      if (err instanceof LLMError) throw err;

      if (attemptsLeft > 0) {
        logger.warn({ err }, "GroqProvider: attempt failed, retrying once");
        await sleep(2000);
        return this.callWithRetry(request, attemptsLeft - 1);
      }

      throw this.mapError(err);
    }
  }

  private async callText(request: LLMRequest): Promise<string> {
    const client = new Groq({
      apiKey:  request.apiKey,
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
    if (!reply) throw new LLMError("UNKNOWN", "Groq returned empty response");
    return reply;
  }

  private mapError(err: unknown): LLMError {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("api key") || msg.includes("authentication") || msg.includes("401")) {
      return new LLMError("INVALID_KEY", "Invalid Groq API key. Check your key in Settings.", err);
    }
    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
      return new LLMError("RATE_LIMIT", "Groq rate limit exceeded. Try again shortly.", err);
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new LLMError("TIMEOUT", "Groq took too long to respond. Try again.", err);
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("unavailable")) {
      return new LLMError("PROVIDER_DOWN", "Groq is temporarily unavailable.", err);
    }

    logger.error({ err }, "GroqProvider: unmapped error");
    return new LLMError("UNKNOWN", "Failed to get a response from Groq.", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
