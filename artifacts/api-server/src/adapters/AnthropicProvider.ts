// ─── AnthropicProvider.ts ─────────────────────────────────────────
// ADAPTER: Anthropic Provider
//
// WHY this exists:
// → Real implementation of ILLMProvider for Anthropic
// → Handles text chat and vision (image input)
// → 30 second timeout built in
// → Retries once on failure before throwing
// → Throws typed LLMError — never generic messages
//
// NOTE: Anthropic API is different from OpenAI:
// → System prompt is a separate field (not in messages array)
// → Vision uses a different content block structure
//
// MODELS SUPPORTED:
// → claude-3-5-sonnet-20241022
// → claude-3-haiku-20240307
// → claude-3-opus-20240229
// ──────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { ILLMProvider, LLMRequest, LLMResponse } from "../ports/ILLMProvider.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { logger } from "../lib/logger.js";

const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;

export class AnthropicProvider implements ILLMProvider {

  async chat(request: LLMRequest): Promise<LLMResponse> {
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
      if (err instanceof LLMError) throw err;

      if (attemptsLeft > 0) {
        logger.warn({ err }, "AnthropicProvider: attempt failed, retrying once");
        await sleep(2000);
        return this.callWithRetry(request, attemptsLeft - 1);
      }

      throw this.mapError(err);
    }
  }

  private async callText(request: LLMRequest): Promise<string> {
    const client = new Anthropic({
      apiKey: request.apiKey,
      timeout: TIMEOUT_MS,
    });

    const response = await client.messages.create({
      model:      request.model,
      max_tokens: MAX_TOKENS,
      system:     request.instructions,
      // ↑ Anthropic uses separate system field
      // not inside messages array like OpenAI
      messages: [
        ...request.conversationHistory.map(m => ({
          role:    m.role === "assistant" ? "assistant" as const : "user" as const,
          content: m.content,
        })),
        { role: "user", content: request.message },
      ],
    });

    const block = response.content[0];
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new LLMError("UNKNOWN", "Anthropic returned empty response");
    }
    return block.text.trim();
  }

  private async callVision(request: LLMRequest): Promise<string> {
    if (!request.image) throw new LLMError("UNKNOWN", "No image provided");

    const client = new Anthropic({
      apiKey: request.apiKey,
      timeout: TIMEOUT_MS,
    });

    const response = await client.messages.create({
      model:      request.model,
      max_tokens: MAX_TOKENS,
      system:     request.instructions,
      messages: [
        ...request.conversationHistory.map(m => ({
          role:    m.role === "assistant" ? "assistant" as const : "user" as const,
          content: m.content,
        })),
        {
          role: "user",
          content: [
            {
              type:   "image" as const,
              source: {
                type:       "base64" as const,
                media_type: request.image.mimeType as
                  "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data:       request.image.base64,
              },
            },
            ...(request.message
              ? [{ type: "text" as const, text: request.message }]
              : []),
          ],
        },
      ],
    });

    const block = response.content[0];
    if (!block || block.type !== "text" || !block.text.trim()) {
      throw new LLMError("UNKNOWN", "Anthropic vision returned empty response");
    }
    return block.text.trim();
  }

  private mapError(err: unknown): LLMError {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("api key") || msg.includes("authentication") || msg.includes("401")) {
      return new LLMError("INVALID_KEY", "Invalid Anthropic API key. Check your key in Settings.", err);
    }
    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
      return new LLMError("RATE_LIMIT", "Anthropic rate limit exceeded. Try again shortly.", err);
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new LLMError("TIMEOUT", "Anthropic took too long to respond. Try again.", err);
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("unavailable")) {
      return new LLMError("PROVIDER_DOWN", "Anthropic is temporarily unavailable.", err);
    }

    logger.error({ err }, "AnthropicProvider: unmapped error");
    return new LLMError("UNKNOWN", "Failed to get a response from Anthropic.", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
