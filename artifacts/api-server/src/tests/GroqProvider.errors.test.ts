// ─── GroqProvider.errors.test.ts ──────────────────────────────────
// TDD TESTS for GroqProvider error classification
//
// WHY these exist:
// → Proves mapError correctly classifies HTTP 413 (token limit)
// → Proves mapError correctly classifies HTTP 429 (rate limit)
// → Proves mapError correctly classifies HTTP 401 (bad key)
// → Proves mapError correctly classifies HTTP 503 (provider down)
// → Proves mapError correctly classifies timeout errors
// → Proves unknown errors fall through to UNKNOWN safely
//
// STRATEGY:
// → mapError is private — tested through public chat() method
// → groq-sdk Groq class is mocked using function keyword (Vitest v4
//   requirement — arrow functions cannot be called with new)
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMError } from "../ports/ILLMProvider.js";
import type { LLMRequest } from "../ports/ILLMProvider.js";

// ── Helper: build a fake Groq _APIError with a specific HTTP status
function makeGroqApiError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

// ── Shared mock create fn — must be declared before vi.mock ───────
const mockCreate = vi.fn();

// ── Mock groq-sdk BEFORE importing GroqProvider ───────────────────
// Must use `function` keyword — Vitest v4 forbids arrow functions
// for constructor mocks (arrow fns have no prototype, can't use new)
vi.mock("groq-sdk", () => ({
  default: vi.fn(function(this: any) {
    this.chat = { completions: { create: mockCreate } };
  }),
}));

// ── Import AFTER vi.mock so the mock is in place ──────────────────
import { GroqProvider } from "../adapters/GroqProvider.js";

const baseRequest: LLMRequest = {
  apiKey:              "gsk_test",
  model:               "llama-3.1-8b-instant",
  instructions:        "You are helpful",
  message:             "Hello",
  conversationHistory: [],
};

describe("GroqProvider error classification", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("❌ HTTP 413 (token limit exceeded) → RATE_LIMIT code", async () => {
    mockCreate.mockRejectedValue(
      makeGroqApiError(413,
        "Request too large for model `llama-3.1-8b-instant` TPM: Limit 6000, Requested 17485"
      )
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("RATE_LIMIT");
  });

  it("❌ HTTP 429 (rate limit exceeded) → RATE_LIMIT code", async () => {
    mockCreate.mockRejectedValue(
      makeGroqApiError(429, "Rate limit exceeded. Too many requests.")
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("RATE_LIMIT");
  });

  it("❌ HTTP 401 (invalid API key) → INVALID_KEY code", async () => {
    mockCreate.mockRejectedValue(
      makeGroqApiError(401, "Invalid API key provided.")
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("INVALID_KEY");
  });

  it("❌ HTTP 503 (provider down) → PROVIDER_DOWN code", async () => {
    mockCreate.mockRejectedValue(
      makeGroqApiError(503, "Service unavailable.")
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("PROVIDER_DOWN");
  });

  it("❌ timeout error message → TIMEOUT code", async () => {
    mockCreate.mockRejectedValue(
      new Error("Request timed out after 30000ms")
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("TIMEOUT");
  });

  it("❌ completely unknown error → UNKNOWN code", async () => {
    mockCreate.mockRejectedValue(
      new Error("Some unexpected internal error")
    );
    const provider = new GroqProvider();
    const err = await provider.chat(baseRequest).catch(e => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("UNKNOWN");
  });

  it("✅ successful response returns reply string", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello from Groq!" } }],
    });
    const provider = new GroqProvider();
    const result = await provider.chat(baseRequest);
    expect(result.reply).toBe("Hello from Groq!");
  });

});
