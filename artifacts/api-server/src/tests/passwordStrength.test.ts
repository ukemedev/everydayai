// ─── passwordStrength.test.ts ─────────────────────────────────────
// TDD TESTS for password strength enforcement
//
// WHY these exist:
// → Users were able to sign up with "password", "123456", etc.
// → Backend now rejects score < 3 (out of 4) using zxcvbn-ts.
// → Frontend shows real-time meter + specific feedback.
//
// IMPLEMENTATION NOTE:
// → zxcvbn-ts is a pure function — no mocking needed.
// → Route tests use mock req/res (matching admin.verify.test.ts pattern).
//
// SEALED FOREVER:
// → "password"                         → score < 3 (rejected)     ✅
// → "abc123"                           → score < 3 (rejected)     ✅
// → "Tr0ub4dor&3"                      → score >= 3 (accepted)    ✅
// → "correct-horse-battery-staple"     → score >= 3 (accepted)    ✅
// → weak password → suggestions array not empty                   ✅
// → POST /check-password weak → 422 WEAK_PASSWORD + suggestions   ✅
// → POST /check-password strong → 200 + score                     ✅
// → POST /check-password missing body → 400 MISSING_PASSWORD      ✅
// → feedback.warning returned in 422 body                         ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── No Supabase calls in this module — no DB mocks needed ─────────
vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn(), isEmailConfigured: () => false,
}));
vi.mock("../lib/emails/welcome.js", () => ({
  welcomeEmailHtml:    vi.fn().mockReturnValue(""),
  welcomeEmailSubject: vi.fn().mockReturnValue(""),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: vi.fn() } })),
}));

// ── Import AFTER mocks ─────────────────────────────────────────────
import { checkPasswordStrength } from "../lib/passwordStrength.js";
import authRouter from "../routes/authEmail.js";

// ── Helper: pull the handler for POST /auth/check-password ────────
function getCheckPasswordHandler() {
  const layer = (authRouter as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (req: Request, res: Response) => void; method: string }> } }> }).stack
    .find((l) => l.route?.path === "/auth/check-password" && l.route.stack.some((s) => s.method === "post"));
  if (!layer?.route) throw new Error("Route /auth/check-password not registered");
  return layer.route.stack.find((s) => s.method === "post")!.handle;
}

function mockRes() {
  const res = {
    status: vi.fn(),
    json:   vi.fn(),
  } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function mockReq(body: Record<string, unknown>): Request {
  return { body, headers: {}, log: { warn: vi.fn() } } as unknown as Request;
}

// ─────────────────────────────────────────────────────────────────
// SECTION 1 — Pure function: checkPasswordStrength
// ─────────────────────────────────────────────────────────────────

describe("checkPasswordStrength — pure function", () => {

  it('❌ "password" → score < 3', () => {
    const result = checkPasswordStrength("password");
    expect(result.score).toBeLessThan(3);
    expect(result.isAcceptable).toBe(false);
  });

  it('❌ "abc123" → score < 3', () => {
    const result = checkPasswordStrength("abc123");
    expect(result.score).toBeLessThan(3);
    expect(result.isAcceptable).toBe(false);
  });

  it('❌ "123456789" → score < 3', () => {
    const result = checkPasswordStrength("123456789");
    expect(result.score).toBeLessThan(3);
    expect(result.isAcceptable).toBe(false);
  });

  it('✅ "Tr0ub4dor&3" → score >= 3', () => {
    const result = checkPasswordStrength("Tr0ub4dor&3");
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.isAcceptable).toBe(true);
  });

  it('✅ "correct-horse-battery-staple" → score >= 3', () => {
    const result = checkPasswordStrength("correct-horse-battery-staple");
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.isAcceptable).toBe(true);
  });

  it('✅ weak password → suggestions array is not empty', () => {
    const result = checkPasswordStrength("password");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('✅ strong password → score is a number 0-4', () => {
    const result = checkPasswordStrength("Tr0ub4dor&3");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it('✅ returns warning string (may be empty for strong passwords)', () => {
    const result = checkPasswordStrength("Tr0ub4dor&3");
    expect(typeof result.warning).toBe("string");
  });

  it('✅ isAcceptable is true iff score >= 3', () => {
    const weak   = checkPasswordStrength("hello123");
    const strong = checkPasswordStrength("Tr0ub4dor&3");
    expect(weak.isAcceptable).toBe(weak.score >= 3);
    expect(strong.isAcceptable).toBe(strong.score >= 3);
  });

});

// ─────────────────────────────────────────────────────────────────
// SECTION 2 — Route: POST /api/auth/check-password
// ─────────────────────────────────────────────────────────────────

describe("POST /auth/check-password — route handler", () => {

  let handler: (req: Request, res: Response) => void;

  beforeEach(() => {
    handler = getCheckPasswordHandler();
  });

  it("❌ weak password → 422 WEAK_PASSWORD with suggestions", async () => {
    const req = mockReq({ password: "password" });
    const res = mockRes();
    await handler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(422);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(body.error).toBe("WEAK_PASSWORD");
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect((body.suggestions as string[]).length).toBeGreaterThan(0);
  });

  it("❌ weak password → 422 body includes score", async () => {
    const req = mockReq({ password: "abc123" });
    const res = mockRes();
    await handler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(422);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof body.score).toBe("number");
    expect(body.score as number).toBeLessThan(3);
  });

  it("❌ weak password → 422 body includes warning field", async () => {
    const req = mockReq({ password: "password" });
    const res = mockRes();
    await handler(req, res);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof body.warning).toBe("string");
  });

  it("✅ strong password → 200 with score >= 3", async () => {
    const req = mockReq({ password: "Tr0ub4dor&3" });
    const res = mockRes();
    await handler(req, res);
    const statusCalls = (res.status as ReturnType<typeof vi.fn>).mock.calls;
    const jsonBody = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    // 200 — may be implicit (no .status() call) or explicit
    if (statusCalls.length > 0) {
      expect(statusCalls[0][0]).toBe(200);
    }
    expect(jsonBody.ok).toBe(true);
    expect(jsonBody.score as number).toBeGreaterThanOrEqual(3);
  });

  it("❌ missing password field → 400 MISSING_PASSWORD", async () => {
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(body.error).toBe("MISSING_PASSWORD");
  });

  it("❌ non-string password → 400 MISSING_PASSWORD", async () => {
    const req = mockReq({ password: 12345 });
    const res = mockRes();
    await handler(req, res);
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400);
  });

});
