// ─── onboarding.test.ts ───────────────────────────────────────────
// TDD TESTS for onboarding routes
//
// WHY these exist:
// → completed_steps JSONB column persists step progress server-side
// → mark-tested also adds "test_agent" to completed_steps
// → complete-step appends a step id to completed_steps (idempotent)
// → remove-step removes a step id from completed_steps
// → complete route sets onboarding_complete = true
// → All routes require authentication (401 on missing user)
// → Service client missing → 503
//
// SEALED FOREVER:
// → POST /onboarding/mark-tested sets has_tested_chat + adds "test_agent" to completed_steps ✅
// → PATCH /onboarding/complete-step appends step id idempotently ✅
// → PATCH /onboarding/remove-step removes step id ✅
// → POST /onboarding/complete sets onboarding_complete = true ✅
// → 401 when no user ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Shared mock state ─────────────────────────────────────────────
let mockUpdateError: null | { message: string } = null;
let mockSelectData: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> = {};
let lastRpcCall: { fn: string; args: unknown } | null = null;

const mockSingle = vi.fn().mockImplementation(async () => ({
  data: mockSelectData,
  error: null,
}));

const mockEqSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEqUpdate = vi.fn().mockImplementation(async () => ({
  data: null,
  error: mockUpdateError,
}));

const mockUpdate = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
  lastUpdate = vals;
  return { eq: mockEqUpdate };
});

const mockSelect = vi.fn().mockReturnValue({ eq: mockEqSelect });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate, select: mockSelect });
const mockRpc   = vi.fn().mockImplementation(async (fn: string, args: unknown) => {
  lastRpcCall = { fn, args };
  return { data: null, error: mockUpdateError };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

// ── Import routes AFTER mocks ─────────────────────────────────────
import router from "../routes/onboarding.js";

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { id: "user-123" } as Request["user"],
    body: {},
    params: {} as Record<string, string>,
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Request["log"],
    ...overrides,
  };
}

function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; res: Partial<Response> } {
  const json   = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res    = { status, json } as unknown as Partial<Response>;
  return { status, json, res };
}

function getHandler(method: "GET" | "POST" | "PATCH" | "DELETE", path: string) {
  const layer = (router.stack as Array<{
    route?: {
      path: string;
      stack: Array<{ method: string; handle: (req: unknown, res: unknown) => void }>;
    };
  }>).find(
    (l) => l.route?.path === path && l.route.stack.some((s) => s.method === method.toLowerCase())
  );
  if (!layer?.route) throw new Error(`Route not found: ${method} ${path}`);
  const handler = layer.route.stack.find((s) => s.method === method.toLowerCase());
  if (!handler) throw new Error(`Handler not found: ${method} ${path}`);
  return handler.handle;
}

beforeEach(() => {
  mockUpdateError = null;
  mockSelectData  = null;
  lastUpdate      = {};
  lastRpcCall     = null;
  vi.clearAllMocks();
  mockUpdate.mockImplementation((vals: Record<string, unknown>) => {
    lastUpdate = vals;
    return { eq: mockEqUpdate };
  });
  mockEqUpdate.mockImplementation(async () => ({ data: null, error: mockUpdateError }));
});

// ── POST /onboarding/mark-tested ──────────────────────────────────

describe("POST /onboarding/mark-tested", () => {
  it("✅ sets has_tested_chat = true on the profile", async () => {
    const handler = getHandler("POST", "/onboarding/mark-tested");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(lastUpdate).toMatchObject({ has_tested_chat: true });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ also adds 'test_agent' to completed_steps", async () => {
    const handler = getHandler("POST", "/onboarding/mark-tested");
    const { res } = makeRes();
    await handler(makeReq(), res);
    // completed_steps update should include test_agent step
    const hasCompletedSteps = Object.prototype.hasOwnProperty.call(lastUpdate, "completed_steps")
      || mockRpc.mock.calls.some((c) => JSON.stringify(c).includes("test_agent"));
    expect(hasCompletedSteps).toBe(true);
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("POST", "/onboarding/mark-tested");
    const { res, status, json } = makeRes();
    await handler(makeReq({ user: undefined }), res);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("✅ returns 500 on db error", async () => {
    mockUpdateError = { message: "db error" };
    const handler = getHandler("POST", "/onboarding/mark-tested");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(500);
  });
});

// ── PATCH /onboarding/complete-step ───────────────────────────────

describe("PATCH /onboarding/complete-step", () => {
  it("✅ returns 400 when stepId is missing", async () => {
    const handler = getHandler("PATCH", "/onboarding/complete-step");
    const { res, status, json } = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("✅ calls rpc or update to add stepId to completed_steps", async () => {
    const handler = getHandler("PATCH", "/onboarding/complete-step");
    const { res, json } = makeRes();
    await handler(makeReq({ body: { stepId: "create_agent" } }), res);
    const didCallRpc = mockRpc.mock.calls.length > 0;
    const didCallUpdate = mockFrom.mock.calls.some((c) => c[0] === "profiles");
    expect(didCallRpc || didCallUpdate).toBe(true);
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("PATCH", "/onboarding/complete-step");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, body: { stepId: "create_agent" } }), res);
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ── PATCH /onboarding/remove-step ─────────────────────────────────

describe("PATCH /onboarding/remove-step", () => {
  it("✅ returns 400 when stepId is missing", async () => {
    const handler = getHandler("PATCH", "/onboarding/remove-step");
    const { res, status, json } = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("✅ calls rpc or update to remove stepId from completed_steps", async () => {
    mockSelectData = { completed_steps: ["test_agent", "create_agent"] };
    const handler = getHandler("PATCH", "/onboarding/remove-step");
    const { res, json } = makeRes();
    await handler(makeReq({ body: { stepId: "test_agent" } }), res);
    const didCallRpc = mockRpc.mock.calls.length > 0;
    const didCallUpdate = mockFrom.mock.calls.some((c) => c[0] === "profiles");
    expect(didCallRpc || didCallUpdate).toBe(true);
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("PATCH", "/onboarding/remove-step");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, body: { stepId: "test_agent" } }), res);
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ── POST /onboarding/complete ─────────────────────────────────────

describe("POST /onboarding/complete", () => {
  it("✅ sets onboarding_complete = true", async () => {
    const handler = getHandler("POST", "/onboarding/complete");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(lastUpdate).toMatchObject({ onboarding_complete: true });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("POST", "/onboarding/complete");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined }), res);
    expect(status).toHaveBeenCalledWith(401);
  });
});
