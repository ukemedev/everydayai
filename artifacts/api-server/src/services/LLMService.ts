// ─── LLMService.ts ────────────────────────────────────────────────
// SERVICE: LLM Router
//
// WHY this exists:
// → One job: route request to correct provider
// → Detects provider from model name automatically
// → chat.ts never imports OpenAI or Anthropic directly
// → chat.ts only calls LLMService.chat()
// → Adding a new provider = add adapter + update this file only
//
// PROVIDERS:
// → openai → OpenAIProvider (primary — v2 design decision #2, OpenAI-only)
// → groq   → GroqProvider (TEMPORARY exception — kept live for testing only,
//             until OpenAI account is funded. Remove once OpenAI is funded,
//             per the locked design decision of OpenAI-only.)
// ──────────────────────────────────────────────────────────────────

import { OpenAIProvider } from "../adapters/OpenAIProvider.js";
import { GroqProvider }   from "../adapters/GroqProvider.js";
import type { ILLMProvider, LLMRequest, LLMResponse } from "../ports/ILLMProvider.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { logger } from "../lib/logger.js";

export class LLMService {

  // Provider instances — created once and reused
  private providers: Record<string, ILLMProvider> = {
    openai: new OpenAIProvider(),
    groq:   new GroqProvider(),
  };

  /**
   * Route request to correct provider and return reply.
   *
   * @param provider - "openai" (primary) | "groq" (temporary testing fallback)
   * @param request  - full LLMRequest with key, model, history, message
   * @returns LLMResponse with reply text
   *
   * Throws LLMError with typed code on failure.
   */
  async chat(
    provider: string,
    request: LLMRequest
  ): Promise<LLMResponse> {

    // Find the correct provider adapter
    const selectedProvider = this.providers[provider];

    if (!selectedProvider) {
      // Unknown provider — this should never happen if KeyResolutionService works
      // But we handle it gracefully anyway
      logger.error({ provider }, "LLMService: unknown provider requested");
      throw new LLMError(
        "UNKNOWN",
        `Unknown AI provider: ${provider}. Please contact support.`
      );
    }

    logger.info(
      { provider, model: request.model, hasImage: !!request.image },
      "LLMService: routing to provider"
    );

    // Delegate to the correct provider
    // Provider handles timeout, retry, and error mapping internally
    return selectedProvider.chat(request);
  }
}

/**
 * Map LLMError code to HTTP status code.
 * Used by chat.ts to return correct HTTP response.
 */
export function llmErrorToHttpStatus(code: string): number {
  switch (code) {
    case "INVALID_KEY":    return 401;
    case "RATE_LIMIT":     return 429;
    case "PROVIDER_DOWN":  return 503;
    case "TIMEOUT":        return 504;
    default:               return 500;
  }
}