// ─── aiCall.processor.test.ts ─────────────────────────────────────
// TDD TESTS for AI call processor
//
// WHY these exist:
// → Business logic tested in complete isolation
// → No real Redis, no real AI API calls
//
// VITEST CLASS MOCK PATTERN (from official docs):
// → Cannot use mockReturnValue on class constructors
// → Must use mockImplementation with class keyword
// → vi.hoisted() prevents hoisting ReferenceError
//
// REAL LLMService.chat signature:
//   chat(provider: string, request: LLMRequest): Promise<LLMResponse>
// REAL LLMResponse shape: { reply: string }
//
// SEALED FOREVER:
// → Returns result on successful AI call ✅
// → Calls LLMService with correct args ✅
// → Throws AppError when agentId missing ✅
// → Throws AppError when message missing ✅
// → Throws AppError when apiKey missing ✅
// → Throws AppError on unknown provider ✅
// → Throws AppError when LLMError thrown ✅
// → Throws AppError when generic Error thrown ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "../middlewares/errorHandler";
import { LLMError } from "../ports/ILLMProvider";

// ── vi.hoisted ensures mockChat is initialized before vi.mock runs ─
const { mockChat } = vi.hoisted(() => ({
  mockChat: vi.fn().mockResolvedValue({ reply: "Hello from AI" }),
}));

// ── Mock LLMService using class syntax — required for constructors ─
// Source: https://vitest.dev/api/mock#class-support
vi.mock("../services/LLMService", () => ({
  LLMService: vi.fn().mockImplementation(class {
    chat = mockChat;
  }),
}));

// ── Import processor AFTER mock is set up ─────────────────────────
import {
  processAiCall,
  type AiCallJobData,
} from "../queues/processors/aiCall.processor";

// ── Valid base job data ───────────────────────────────────────────
const validJobData: AiCallJobData = {
  agentId: "agent-123",
  userId: "user-456",
  message: "Hello, how are you?",
  provider: "openai",
  model: "gpt-4o-mini",
  instructions: "You are a helpful assistant",
  conversationHistory: [],
  apiKey: "test-api-key-fake",
  conversationId: "conv-789",
};

describe("processAiCall", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockResolvedValue({ reply: "Hello from AI" });
  });

  it("✅ returns result on successful AI call", async () => {
    const result = await processAiCall(validJobData);
    expect(result.success).toBe(true);
    expect(result.reply).toBe("Hello from AI");
    expect(result.agentId).toBe("agent-123");
    expect(result.conversationId).toBe("conv-789");
  });

  it("✅ calls LLMService with correct provider and request shape", async () => {
    await processAiCall(validJobData);
    expect(mockChat).toHaveBeenCalledWith(
      "openai",
      expect.objectContaining({
        apiKey: "test-api-key-fake",
        model: "gpt-4o-mini",
        message: "Hello, how are you?",
        instructions: "You are a helpful assistant",
        conversationHistory: [],
      })
    );
  });

  it("❌ throws AppError when agentId is missing", async () => {
    await expect(processAiCall({ ...validJobData, agentId: "" }))
      .rejects.toThrow(AppError);
  });

  it("❌ throws AppError when message is missing", async () => {
    await expect(processAiCall({ ...validJobData, message: "" }))
      .rejects.toThrow(AppError);
  });

  it("❌ throws AppError when apiKey is missing", async () => {
    await expect(processAiCall({ ...validJobData, apiKey: "" }))
      .rejects.toThrow(AppError);
  });

  it("❌ throws AppError when provider is unknown", async () => {
    await expect(
      processAiCall({ ...validJobData, provider: "unknown-provider" })
    ).rejects.toThrow(AppError);
  });

  it("❌ throws AppError when LLMService throws LLMError", async () => {
    mockChat.mockRejectedValueOnce(
      new LLMError("RATE_LIMIT", "Too many requests")
    );
    await expect(processAiCall(validJobData)).rejects.toThrow(AppError);
  });

  it("❌ throws AppError when LLMService throws generic Error", async () => {
    mockChat.mockRejectedValueOnce(new Error("Network timeout"));
    await expect(processAiCall(validJobData)).rejects.toThrow(AppError);
  });

});
