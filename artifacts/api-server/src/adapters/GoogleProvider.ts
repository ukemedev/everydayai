// ─── GoogleProvider.ts ────────────────────────────────────────────
// ADAPTER: Google Gemini Provider
//
// WHY this exists:
// → Real implementation of ILLMProvider for Google Gemini
// → Handles text chat and vision (image input)
// → 30 second timeout built in
// → Retries once on failure before throwing
// → Throws typed LLMError — never generic messages
//
// NOTE: Google API is different from OpenAI and Anthropic:
// → Uses "model" object not a client directly
// → History uses "user"/"model" roles (not "user"/"assistant")
// → Vision uses inlineData with base64
//
// MODELS SUPPORTED:
// → gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash
// ──────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ILLMProvider, LLMRequest, LLMResponse } from "../ports/ILLMProvider.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { logger } from "../lib/logger.js";

const TIMEOUT_MS = 30_000;

export class GoogleProvider implements ILLMProvider {

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
        logger.warn({ err }, "GoogleProvider: attempt failed, retrying once");
        await sleep(2000);
        return this.callWithRetry(request, attemptsLeft - 1);
      }

      throw this.mapError(err);
    }
  }

  private async callText(request: LLMRequest): Promise<string> {
    const genAI = new GoogleGenerativeAI(request.apiKey);
    const model = genAI.getGenerativeModel({
      model: request.model,
      systemInstruction: request.instructions,
      // ↑ Google uses systemInstruction not system prompt in messages
    });

    // Google uses "user"/"model" roles — not "user"/"assistant"
    const history = request.conversationHistory.map(m => ({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new LLMError("TIMEOUT", "Google took too long to respond.")), TIMEOUT_MS)
    );

    const result = await Promise.race([
      chat.sendMessage(request.message),
      timeoutPromise,
    ]);

    const reply = result.response.text().trim();
    if (!reply) throw new LLMError("UNKNOWN", "Google returned empty response");
    return reply;
  }

  private async callVision(request: LLMRequest): Promise<string> {
    if (!request.image) throw new LLMError("UNKNOWN", "No image provided");

    const genAI = new GoogleGenerativeAI(request.apiKey);
    const model = genAI.getGenerativeModel({
      model: request.model,
      systemInstruction: request.instructions,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new LLMError("TIMEOUT", "Google vision took too long.")), TIMEOUT_MS)
    );

    const result = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            mimeType: request.image.mimeType,
            data:     request.image.base64,
          },
        },
        { text: request.message || "Describe this image." },
      ]),
      timeoutPromise,
    ]);

    const reply = result.response.text().trim();
    if (!reply) throw new LLMError("UNKNOWN", "Google vision returned empty response");
    return reply;
  }

  private mapError(err: unknown): LLMError {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";

    if (msg.includes("api key") || msg.includes("authentication") || msg.includes("401")) {
      return new LLMError("INVALID_KEY", "Invalid Google API key. Check your key in Settings.", err);
    }
    if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
      return new LLMError("RATE_LIMIT", "Google rate limit exceeded. Try again shortly.", err);
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new LLMError("TIMEOUT", "Google took too long to respond. Try again.", err);
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("unavailable")) {
      return new LLMError("PROVIDER_DOWN", "Google Gemini is temporarily unavailable.", err);
    }

    logger.error({ err }, "GoogleProvider: unmapped error");
    return new LLMError("UNKNOWN", "Failed to get a response from Google.", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
