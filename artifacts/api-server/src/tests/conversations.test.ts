// ─── conversations.test.ts ────────────────────────────────────────
// TDD TESTS for conversation delete endpoints
//
// WHY these exist:
// → DELETE /api/conversations/:id soft-deletes a single conversation (sets deleted_at)
// → DELETE /api/conversations soft-deletes ALL conversations for the user
// → Both require authentication
// → Ownership is always enforced (cannot delete another user's convo)
// → Returns 404 when conversation doesn't exist or user doesn't own it
//
// SEALED FOREVER:
// → DELETE /conversations/:id → sets deleted_at, returns { ok: true } ✅
// → DELETE /conversations → soft-deletes all user's conversations ✅
// → 401 when no user on both endpoints ✅
// → 404 when convo not found or not owned ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Shared mock state ─────────────────────────────────────────────
let mockUpdateError: null | { message: string } = null;
let mockConvData: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> = {};
let lastEqChain: string[] = [];

const mockEqFinal = vi.fn().mockImplementation(async () => ({
  data: null,
  error: mockUpdateError,
}));

const mockEqChained = vi.fn().mockImplementation((_col: string, _val: unknown) => ({
  eq: mockEqFinal,
}));

const mockUpdate = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
  lastUpdate = vals;
  return { eq: mockEqChained };
});

// For .select().eq().maybeSingle()
const mockMaybeSingle = vi.fn().mockImplementation(async () => ({
  data: mockConvData,
  error: null,
}));
const mockSelectEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle, eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }) });
const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq });

const mockFrom = vi.fn().mockImplementation((_table: string) => ({
  update: mockUpdate,
  select: mockSelect,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../lib/sanitize.js", () => ({ sanitizeText: (t: string) => t }));
vi.mock("../lib/encryption.js", () => ({ decrypt: (t: string) => t, isEncrypted: () => false }));
vi.mock("../lib/whatsappClient.js", () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock("../lib/metaClient.js", () => ({ sendMetaMessage: vi.fn() }));

import router from "../routes/conversations.js";

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user:   { id: "user-abc" } as Request["user"],
    body:   {},
    params: {} as Record<string, string>,
    query:  {} as Record<string, string>,
    log:    { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Request["log"],
    ...overrides,
  };
}

function makeRes() {
  const json   = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, res: { status, json } as unknown as Partial<Response> };
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
  mockConvData    = { id: "conv-1", owner_id: "user-abc" };
  lastUpdate      = {};
  lastEqChain     = [];
  vi.clearAllMocks();

  mockEqFinal.mockImplementation(async () => ({ data: null, error: mockUpdateError }));
  mockEqChained.mockImplementation((_col: string, _val: unknown) => ({ eq: mockEqFinal }));
  mockUpdate.mockImplementation((vals: Record<string, unknown>) => {
    lastUpdate = vals;
    return { eq: mockEqChained };
  });
  mockMaybeSingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
  mockSelectEq.mockReturnValue({ maybeSingle: mockMaybeSingle, eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }) });
  mockSelect.mockReturnValue({ eq: mockSelectEq });
  mockFrom.mockImplementation((_table: string) => ({
    update: mockUpdate,
    select: mockSelect,
  }));
});

// ── DELETE /conversations/:id ──────────────────────────────────────

describe("DELETE /conversations/:id", () => {
  it("✅ soft-deletes conversation by setting deleted_at", async () => {
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(lastUpdate).toMatchObject({ deleted_at: expect.any(String) });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, params: { id: "conv-1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 404 when conversation not found", async () => {
    mockConvData = null;
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "no-exist" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("✅ returns 404 when owned by different user", async () => {
    mockConvData = { id: "conv-1", owner_id: "other-user" };
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("✅ returns 500 on db error", async () => {
    mockUpdateError = { message: "db gone" };
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(500);
  });
});

// ── DELETE /conversations ──────────────────────────────────────────

describe("DELETE /conversations", () => {
  it("✅ soft-deletes all conversations for user", async () => {
    const handler = getHandler("DELETE", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(mockFrom).toHaveBeenCalledWith("conversations");
    expect(lastUpdate).toMatchObject({ deleted_at: expect.any(String) });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("DELETE", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 500 on db error", async () => {
    mockUpdateError = { message: "db error" };
    // For bulk delete, update().eq() returns error directly
    mockEqChained.mockImplementation(async () => ({ data: null, error: mockUpdateError }));
    const handler = getHandler("DELETE", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(500);
  });
});
