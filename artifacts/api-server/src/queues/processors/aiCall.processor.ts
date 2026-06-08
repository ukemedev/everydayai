// ─── aiCall.processor.ts ──────────────────────────────────────────
// Business logic for processing AI call jobs
//
// WHY this exists:
// → Pure business logic — no queue infrastructure here
// → Fully testable in isolation — no Redis needed
// → Validates job data before touching any AI service
// → All errors wrapped in AppError for consistent handling
//
// REAL LLMService.chat signature (from src/services/LLMService.ts):
//   chat(provider: string, request: LLMRequest): Promise<LLMResponse>
//
// REAL LLMRequest shape (from src/ports/ILLMProvider.ts):
//   { apiKey, model, instructions, message, conversationHistory, image? }
//
// REAL LLMResponse shape (from src/ports/ILLMProvider.ts):
//   { reply: string }
//
// REAL LLMError (from src/ports/ILLMProvider.ts):
//   throws LLMError with typed code: INVALID_KEY | RATE_LIMIT | etc
// ─────────────────────────────────────────────────────────────────

import { AppError } from "../../middlewares/errorHandler";
import { logger } from "../../lib/logger";
import { LLMService } from "../../services/LLMService";
import { LLMError } from "../../ports/ILLMProvider";
import type { LLMRequest } from "../../ports/ILLMProvider";

// ── Supported AI providers ────────────────────────────────────────
// Must match providers in LLMService.ts
const SUPPORTED_PROVIDERS = ["openai", "anthropic", "groq", "google"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// ── Job data shape ────────────────────────────────────────────────
// Everything a worker needs to process one AI call
export interface AiCallJobData {
  agentId: string;
  userId: string;
  conversationId: string;
  provider: string;
  model: string;
  apiKey: string;              // decrypted key from KeyResolutionService
  instructions: string;        // agent system prompt
  message: string;             // customer's message
  conversationHistory: {
    role: "user" | "assistant";
    content: string;
  }[];
  image?: {
    base64: string;
    mimeType: string;
  };
}

// ── Job result shape ──────────────────────────────────────────────
export interface AiCallResult {
  success: boolean;
  reply: string;               // matches LLMResponse.reply
  agentId: string;
  conversationId: string;
}

// ── processAiCall ─────────────────────────────────────────────────
// Called by the worker for every job in the ai-call queue
export async function processAiCall(
  data: AiCallJobData
): Promise<AiCallResult> {

  // ── Step 1: Validate job data ───────────────────────────────────
  if (!data.agentId) {
    throw new AppError(400, "AI call job missing agentId", true);
  }

  if (!data.message) {
    throw new AppError(400, "AI call job missing message", true);
  }

  if (!data.apiKey) {
    throw new AppError(400, "AI call job missing apiKey", true);
  }

  if (!SUPPORTED_PROVIDERS.includes(data.provider as SupportedProvider)) {
    throw new AppError(
      400,
      `Unsupported AI provider: ${data.provider}. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
      true
    );
  }

  // ── Step 2: Build LLMRequest from job data ──────────────────────
  // Shape must match LLMRequest in src/ports/ILLMProvider.ts
  const llmRequest: LLMRequest = {
    apiKey: data.apiKey,
    model: data.model,
    instructions: data.instructions,
    message: data.message,
    conversationHistory: data.conversationHistory,
    ...(data.image && { image: data.image }),
  };

  // ── Step 3: Call LLMService ─────────────────────────────────────
  logger.info(
    {
      agentId: data.agentId,
      userId: data.userId,
      provider: data.provider,
      model: data.model,
      conversationId: data.conversationId,
    },
    "Processing AI call job"
  );

  try {
    const llmService = new LLMService();

    // Real signature: chat(provider: string, request: LLMRequest)
    const response = await llmService.chat(data.provider, llmRequest);

    logger.info(
      { agentId: data.agentId, conversationId: data.conversationId },
      "AI call job completed successfully"
    );

    return {
      success: true,
      reply: response.reply, // LLMResponse.reply — not .content
      agentId: data.agentId,
      conversationId: data.conversationId,
    };

  } catch (err) {
    // ── Handle LLMError (typed errors from providers) ─────────────
    if (err instanceof LLMError) {
      logger.error(
        { err, agentId: data.agentId, provider: data.provider, code: err.code },
        "AI call job failed with LLMError"
      );
      throw new AppError(
        500,
        `AI call failed: ${err.userMessage}`,
        false
      );
    }

    // ── Handle generic errors ─────────────────────────────────────
    logger.error(
      { err, agentId: data.agentId, provider: data.provider },
      "AI call job failed with unexpected error"
    );
    throw new AppError(
      500,
      `AI call failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      false
    );
  }
}
