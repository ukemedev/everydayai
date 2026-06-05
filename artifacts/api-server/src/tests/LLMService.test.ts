// ─── LLMService.test.ts ───────────────────────────────────────────
// TDD TESTS for LLMService
//
// WHY these exist:
// → Proves routing to correct provider works
// → Proves vision fallback for Groq works
// → Proves unknown provider throws clean error
// → Uses fake providers — no real AI calls needed
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMService } from "../services/LLMService.js";
import { LLMError } from "../ports/ILLMProvider.js";
import type { LLMRequest } from "../ports/ILLMProvider.js";

// Base request used in all tests
const baseRequest: LLMRequest = {
  apiKey:              "sk-test-key",
  model:               "gpt-4o-mini",
  instructions:        "You are a helpful assistant",
  message:             "Hello",
  conversationHistory: [],
};

describe("LLMService.chat", () => {

  it("✅ routes openai model to OpenAI provider", async () => {
    const service = new LLMService();

    // Mock the OpenAI provider's chat method
    service["providers"]["openai"] = {
      chat: vi.fn().mockResolvedValue({ reply: "Hello from OpenAI" }),
    };

    const result = await service.chat("openai", {
      ...baseRequest,
      model: "gpt-4o-mini",
    });

    expect(result.reply).toBe("Hello from OpenAI");
    expect(service["providers"]["openai"].chat).toHaveBeenCalledOnce();
  });

  it("✅ routes anthropic model to Anthropic provider", async () => {
    const service = new LLMService();

    service["providers"]["anthropic"] = {
      chat: vi.fn().mockResolvedValue({ reply: "Hello from Anthropic" }),
    };

    const result = await service.chat("anthropic", {
      ...baseRequest,
      model: "claude-3-haiku-20240307",
    });

    expect(result.reply).toBe("Hello from Anthropic");
    expect(service["providers"]["anthropic"].chat).toHaveBeenCalledOnce();
  });

  it("✅ routes google model to Google provider", async () => {
    const service = new LLMService();

    service["providers"]["google"] = {
      chat: vi.fn().mockResolvedValue({ reply: "Hello from Google" }),
    };

    const result = await service.chat("google", {
      ...baseRequest,
      model: "gemini-1.5-flash",
    });

    expect(result.reply).toBe("Hello from Google");
    expect(service["providers"]["google"].chat).toHaveBeenCalledOnce();
  });

  it("✅ routes groq model to Groq provider", async () => {
    const service = new LLMService();

    service["providers"]["groq"] = {
      chat: vi.fn().mockResolvedValue({ reply: "Hello from Groq" }),
    };

    const result = await service.chat("groq", {
      ...baseRequest,
      model: "llama-3.3-70b-versatile",
    });

    expect(result.reply).toBe("Hello from Groq");
    expect(service["providers"]["groq"].chat).toHaveBeenCalledOnce();
  });

  it("✅ Groq returns vision fallback when image is sent", async () => {
    // Groq has no vision — must return polite message not crash
    const service = new LLMService();

    const result = await service.chat("groq", {
      ...baseRequest,
      model: "llama-3.3-70b-versatile",
      image: {
        base64:   "fake-base64",
        mimeType: "image/jpeg",
      },
    });

    // Must contain explanation not error
    expect(result.reply).toContain("image");
    expect(result.reply).toContain("does not support");
  });

  it("❌ unknown provider throws LLMError", async () => {
    const service = new LLMService();

    await expect(
      service.chat("unknown-provider", baseRequest)
    ).rejects.toThrow(LLMError);
  });

  it("❌ provider INVALID_KEY error bubbles up correctly", async () => {
    const service = new LLMService();

    service["providers"]["openai"] = {
      chat: vi.fn().mockRejectedValue(
        new LLMError("INVALID_KEY", "Invalid OpenAI API key.")
      ),
    };

    const err = await service
      .chat("openai", baseRequest)
      .catch(e => e);

    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("INVALID_KEY");
  });

  it("❌ provider RATE_LIMIT error bubbles up correctly", async () => {
    const service = new LLMService();

    service["providers"]["openai"] = {
      chat: vi.fn().mockRejectedValue(
        new LLMError("RATE_LIMIT", "Rate limit exceeded.")
      ),
    };

    const err = await service
      .chat("openai", baseRequest)
      .catch(e => e);

    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("RATE_LIMIT");
  });
});
