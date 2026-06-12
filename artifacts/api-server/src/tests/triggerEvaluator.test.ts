// ─── triggerEvaluator.test.ts ────────────────────────────────────
// TDD TESTS for lib/triggerEvaluator.ts
//
// WHY these exist:
// → Seals the three trigger types forever — no silent regressions
// → Proves empty config → false (never fires unconfigured tools)
// → Proves case-insensitive keyword matching
// → Proves data_collected checks combined customer + AI text
// → Proves unknown trigger type → false (safe default)
//
// SEALED FOREVER:
// → always: always returns true ✅
// → keyword: case-insensitive match against customer message ✅
// → keyword: empty list → false ✅
// → keyword: no match → false ✅
// → keyword: partial word match works ✅
// → keyword: whitespace-trimmed keywords ✅
// → data_collected: all fields present in combined text → true ✅
// → data_collected: any field missing → false ✅
// → data_collected: empty fields list → false ✅
// → data_collected: checks AI reply too (not just customer msg) ✅
// → unknown trigger type → false ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { evaluateTrigger } from "../lib/triggerEvaluator.js";

// ── always ────────────────────────────────────────────────────────
describe("evaluateTrigger — always", () => {
  it("✅ returns true for any input", () => {
    expect(evaluateTrigger("always", {}, "hello", "hi there")).toBe(true);
  });

  it("✅ returns true even with empty strings", () => {
    expect(evaluateTrigger("always", {}, "", "")).toBe(true);
  });

  it("✅ returns true regardless of trigger config content", () => {
    expect(evaluateTrigger("always", { keywords: ["x"], fields: ["y"] }, "msg", "reply")).toBe(true);
  });
});

// ── keyword ───────────────────────────────────────────────────────
describe("evaluateTrigger — keyword", () => {
  it("✅ returns true when message contains keyword (exact case)", () => {
    expect(evaluateTrigger("keyword", { keywords: ["price"] }, "What is the price?", "")).toBe(true);
  });

  it("✅ returns true when keyword is uppercase and message is lowercase", () => {
    expect(evaluateTrigger("keyword", { keywords: ["PRICE"] }, "what is the price?", "")).toBe(true);
  });

  it("✅ returns true when keyword is lowercase and message is uppercase", () => {
    expect(evaluateTrigger("keyword", { keywords: ["price"] }, "WHAT IS THE PRICE?", "")).toBe(true);
  });

  it("✅ returns true when any one keyword matches (OR logic)", () => {
    expect(evaluateTrigger("keyword", { keywords: ["buy", "purchase", "order"] }, "I want to buy one", "")).toBe(true);
  });

  it("✅ returns false when message contains none of the keywords", () => {
    expect(evaluateTrigger("keyword", { keywords: ["buy", "purchase"] }, "Hello, how are you?", "")).toBe(false);
  });

  it("✅ returns false when keywords list is empty", () => {
    expect(evaluateTrigger("keyword", { keywords: [] }, "buy now", "")).toBe(false);
  });

  it("✅ returns false when keywords key is missing", () => {
    expect(evaluateTrigger("keyword", {}, "buy now", "")).toBe(false);
  });

  it("✅ trims whitespace from keywords before matching", () => {
    expect(evaluateTrigger("keyword", { keywords: ["  price  "] }, "what is the price", "")).toBe(true);
  });

  it("✅ ignores blank keyword entries (empty string after trim)", () => {
    expect(evaluateTrigger("keyword", { keywords: ["", "  "] }, "buy now", "")).toBe(false);
  });

  it("✅ does not match on AI reply — only customer message", () => {
    // "price" only appears in ai reply, not customer message
    expect(evaluateTrigger("keyword", { keywords: ["price"] }, "tell me more", "The price is $10")).toBe(false);
  });
});

// ── data_collected ────────────────────────────────────────────────
describe("evaluateTrigger — data_collected", () => {
  it("✅ returns true when all fields appear in combined text", () => {
    const customerMsg = "My name is John and my email is john@example.com";
    const aiReply = "Thanks John! I've noted your email.";
    expect(evaluateTrigger("data_collected", { fields: ["name", "email"] }, customerMsg, aiReply)).toBe(true);
  });

  it("✅ returns false when a required field is missing", () => {
    const customerMsg = "My name is John and my email is john@example.com";
    const aiReply = "Thanks, noted!";
    expect(evaluateTrigger("data_collected", { fields: ["name", "email", "phone"] }, customerMsg, aiReply)).toBe(false);
  });

  it("✅ returns false when fields list is empty", () => {
    expect(evaluateTrigger("data_collected", { fields: [] }, "name email phone", "got it")).toBe(false);
  });

  it("✅ returns false when fields key is missing", () => {
    expect(evaluateTrigger("data_collected", {}, "name email phone", "got it")).toBe(false);
  });

  it("✅ checks AI reply as well (field confirmed by agent)", () => {
    const customerMsg = "here is my info";
    const aiReply = "Perfect! I have your name, phone and email.";
    expect(evaluateTrigger("data_collected", { fields: ["name", "phone", "email"] }, customerMsg, aiReply)).toBe(true);
  });

  it("✅ is case-insensitive for field matching", () => {
    const customerMsg = "NAME is John, EMAIL is test@test.com";
    expect(evaluateTrigger("data_collected", { fields: ["name", "email"] }, customerMsg, "")).toBe(true);
  });

  it("✅ trims whitespace from field names", () => {
    expect(evaluateTrigger("data_collected", { fields: ["  name  "] }, "my name is John", "ok")).toBe(true);
  });

  it("✅ ignores blank field entries", () => {
    expect(evaluateTrigger("data_collected", { fields: [""] }, "anything", "anything")).toBe(false);
  });
});

// ── unknown trigger type ──────────────────────────────────────────
describe("evaluateTrigger — unknown type", () => {
  it("✅ returns false for unknown trigger type — safe default", () => {
    // @ts-expect-error — intentionally testing unknown type
    expect(evaluateTrigger("fire_always", {}, "hello", "hi")).toBe(false);
  });
});
