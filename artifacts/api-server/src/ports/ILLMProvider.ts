// ─── ILLMProvider.ts ──────────────────────────────────────────────
// PORT (Contract)
//
// WHY this exists:
// → All 4 providers (OpenAI, Anthropic, Google, Groq) must fulfill
//   this same contract
// → LLMService never imports OpenAI or Anthropic directly
// → It only knows about this contract
// → Tests use a fake provider that returns instant replies
// → Real code uses the actual provider adapters
// ──────────────────────────────────────────────────────────────────

export type LLMRequest = {
  apiKey: string;       // decrypted key from KeyResolutionService
  model: string;        // e.g. "gpt-4o-mini", "claude-3-haiku-20240307"
  instructions: string; // agent system prompt
  message: string;      // what the customer typed
  conversationHistory: {
    role: "user" | "assistant";
    content: string;
  }[];                  // previous messages for context
  image?: {
    base64: string;     // raw image bytes as base64
    mimeType: string;   // e.g. "image/jpeg", "image/png"
  };                    // optional — only sent when customer uploads image
};

export type LLMResponse = {
  reply: string;        // the AI's response text
};

// Typed errors — every provider throws one of these
// This replaces the generic "Failed to get a response"
export type LLMErrorCode =
  | "INVALID_KEY"      // wrong or expired API key
  | "RATE_LIMIT"       // too many requests
  | "PROVIDER_DOWN"    // provider API is unavailable
  | "TIMEOUT"          // request took too long
  | "UNKNOWN";         // anything else

export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    public userMessage: string, // shown to customer
    cause?: unknown
  ) {
    super(userMessage);
    this.name = "LLMError";
    if (cause) this.cause = cause;
  }
}

export interface ILLMProvider {
  /**
   * Call the AI provider and return a reply.
   *
   * @param request - full request with key, model, history, message
   * @returns LLMResponse containing reply text
   *
   * Throws LLMError with typed code on failure.
   * NEVER returns empty string.
   * Has 30 second timeout built in.
   * Retries once automatically before throwing.
   */
  chat(request: LLMRequest): Promise<LLMResponse>;
}
