// ─── tokenBudget.test.ts ───────────────────────────────────────────
// TDD TESTS for lib/tokenBudget.ts
//
// WHY these exist:
// → Proves estimateTokens is correct and conservative
// → Proves truncateToTokenBudget never exceeds budget
// → Proves truncateToTokenBudget preserves content that fits
// → Proves truncateHistory keeps newest, drops oldest
// → Proves truncateHistory handles all edge cases safely
// → These tests seal the token budget behaviour forever
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  truncateToTokenBudget,
  truncateHistory,
  BUDGET_DOC_CONTEXT,
  BUDGET_HISTORY,
  BUDGET_TOOLS_CONTEXT,
} from "../lib/tokenBudget.js";

describe("estimateTokens", () => {

  it("✅ returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("✅ returns 1 for exactly 4 characters", () => {
    expect(estimateTokens("aaaa")).toBe(1);
  });

  it("✅ rounds up — 5 chars = 2 tokens not 1", () => {
    expect(estimateTokens("aaaaa")).toBe(2);
  });

  it("✅ 400 chars = 100 tokens", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("✅ 401 chars = 101 tokens (ceiling)", () => {
    expect(estimateTokens("a".repeat(401))).toBe(101);
  });

});

describe("truncateToTokenBudget", () => {

  it("✅ returns empty string unchanged", () => {
    expect(truncateToTokenBudget("", 100)).toBe("");
  });

  it("✅ returns content unchanged when it fits within budget", () => {
    const text = "Hello world";
    expect(truncateToTokenBudget(text, 100)).toBe(text);
  });

  it("✅ truncated result never exceeds the token budget", () => {
    const longText = "a".repeat(4000);
    const result = truncateToTokenBudget(longText, 100);
    expect(estimateTokens(result)).toBeLessThanOrEqual(100);
  });

  it("✅ appends truncation notice when content is cut", () => {
    const longText = "a".repeat(4000);
    const result = truncateToTokenBudget(longText, 100);
    expect(result).toContain("[truncated");
  });

  it("✅ does NOT append truncation notice when content fits", () => {
    const shortText = "Short text";
    const result = truncateToTokenBudget(shortText, 100);
    expect(result).not.toContain("[truncated");
  });

});

describe("truncateHistory", () => {

  it("✅ returns empty array for empty input", () => {
    expect(truncateHistory([], 500)).toEqual([]);
  });

  it("✅ returns all messages when they fit within budget", () => {
    const history = [
      { role: "user" as const,      content: "Hi" },
      { role: "assistant" as const, content: "Hello" },
      { role: "user" as const,      content: "How are you?" },
    ];
    const result = truncateHistory(history, 500);
    expect(result).toHaveLength(3);
    expect(result).toEqual(history);
  });

  it("✅ keeps newest messages, drops oldest when over budget", () => {
    // Each message is unique so toContainEqual can distinguish them
    // Each message = 200 chars = 50 tokens. Budget = 80 tokens.
    // Only 1 message fits. Newest must be kept, oldest must be dropped.
    const history = [
      { role: "user" as const,      content: "OLDEST:" + "a".repeat(193) },
      { role: "assistant" as const, content: "MIDDLE:" + "a".repeat(193) },
      { role: "user" as const,      content: "NEWEST:" + "a".repeat(193) },
    ];
    const result = truncateHistory(history, 80);
    // Must keep at least the newest
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Newest must be present
    expect(result[result.length - 1].content).toBe(history[2].content);
    // Oldest must be dropped
    expect(result.some(m => m.content === history[0].content)).toBe(false);
  });

  it("✅ always keeps the most recent message even if it alone exceeds budget", () => {
    const bigMessage = { role: "user" as const, content: "a".repeat(500) };
    const history = [
      { role: "assistant" as const, content: "small" },
      bigMessage,
    ];
    const result = truncateHistory(history, 50);
    expect(result[result.length - 1]).toEqual(bigMessage);
  });

  it("✅ result order is preserved — oldest to newest", () => {
    const history = [
      { role: "user" as const,      content: "first" },
      { role: "assistant" as const, content: "second" },
      { role: "user" as const,      content: "third" },
    ];
    const result = truncateHistory(history, 500);
    expect(result[0].content).toBe("first");
    expect(result[2].content).toBe("third");
  });

  it("✅ budget constants are positive numbers", () => {
    expect(BUDGET_DOC_CONTEXT).toBeGreaterThan(0);
    expect(BUDGET_HISTORY).toBeGreaterThan(0);
    expect(BUDGET_TOOLS_CONTEXT).toBeGreaterThan(0);
  });

  it("✅ combined budgets stay safely under Groq 6000 TPM limit", () => {
    const total = BUDGET_DOC_CONTEXT + BUDGET_HISTORY + BUDGET_TOOLS_CONTEXT;
    expect(total).toBeLessThan(5000);
  });

});
