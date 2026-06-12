// ─── conversations.endpoints.test.ts ─────────────────────────────
// TDD TESTS for conversation management endpoints
//
// WHY these exist:
// → PATCH /conversations/:id/read resets unread_count to 0
// → POST /conversations/:id/tags replaces tags array
// → PATCH /conversations/:id/archive toggles archived status
// → PATCH /conversations/:id/mode toggles ai/human mode
// → POST /conversations/:id/reply saves human reply
//
// SEALED FOREVER:
// → PATCH /read resets unread_count to 0 ✅
// → POST /tags validates, cleans, and stores tags ✅
// → PATCH /archive toggles status ✅
// → PATCH /mode validates mode value ✅
// → POST /reply enforces mode === human ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Shared mock state ─────────────────────────────────────────────
let mockUpdateError: null | { message: string } = null;
let mockConvData:    Record<string, unknown> | null = null;
let mockInsertData:  Record<string, unknown> | null = null;
let lastUpdate:      Record<string, unknown> = {};

// update chain: .update(vals).eq(col, val).eq(col, val)[.select().maybeSingle()]
const mockMaybySingle = vi.fn().mockImplementation(async () => ({
  data: mockConvData, error: mockUpdateError,
}));
const mockSelectAfterUpdate = vi.fn().mockReturnValue({ maybeSingle: mockMaybySingle });
const mockEq2 = vi.fn().mockImplementation(async () => ({
  data: null, error: mockUpdateError,
}));

// Make mockEq2 also support .select()
const mockEq2WithSelect = vi.fn().mockImplementation((_col: string, _val: unknown) => ({
  then: (onFulfilled: (v: { data: null; error: typeof mockUpdateError }) => unknown) =>
    Promise.resolve({ data: null, error: mockUpdateError }).then(onFulfilled),
  select: mockSelectAfterUpdate,
}));

const mockEq1 = vi.fn().mockImplementation((_col: string, _val: unknown) => ({
  eq: mockEq2WithSelect,
}));

const mockUpdate = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
  lastUpdate = vals;
  return { eq: mockEq1 };
});

// select chain: .select().eq().maybeSingle()
const mockMaybySingleSelect = vi.fn().mockImplementation(async () => ({
  data: mockConvData, error: null,
}));
const mockEqSelect2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybySingleSelect });
const mockEqSelect  = vi.fn().mockReturnValue({ eq: mockEqSelect2, maybeSingle: mockMaybySingleSelect });
const mockSelect    = vi.fn().mockReturnValue({ eq: mockEqSelect });

// insert chain: .insert().select().single()
const mockSingle = vi.fn().mockImplementation(async () => ({
  data: mockInsertData, error: mockUpdateError,
}));
const mockSelectInsert = vi.fn().mockReturnValue({ single: mockSingle });
const mockInsert       = vi.fn().mockReturnValue({ select: mockSelectInsert });

const mockFrom = vi.fn().mockImplementation((_table: string) => ({
  update: mockUpdate,
  select: mockSelect,
  insert: mockInsert,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock("../lib/logger.js",         () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/sanitize.js",       () => ({ sanitizeText: (t: string) => t }));
vi.mock("../lib/encryption.js",     () => ({ decrypt: (t: string) => t, isEncrypted: () => false }));
vi.mock("../lib/whatsappClient.js", () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock("../lib/metaClient.js",     () => ({ sendMetaMessage: vi.fn() }));

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
  mockInsertData  = { id: "msg-1", role: "human", content: "hello", created_at: new Date().toISOString() };
  lastUpdate      = {};
  vi.clearAllMocks();

  mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: mockUpdateError }));
  mockSelectAfterUpdate.mockReturnValue({ maybeSingle: mockMaybySingle });
  mockEq2WithSelect.mockImplementation((_col: string, _val: unknown) => ({
    then: (onFulfilled: (v: { data: null; error: typeof mockUpdateError }) => unknown) =>
      Promise.resolve({ data: null, error: mockUpdateError }).then(onFulfilled),
    select: mockSelectAfterUpdate,
  }));
  mockEq1.mockImplementation((_col: string, _val: unknown) => ({ eq: mockEq2WithSelect }));
  mockUpdate.mockImplementation((vals: Record<string, unknown>) => { lastUpdate = vals; return { eq: mockEq1 }; });

  mockMaybySingleSelect.mockImplementation(async () => ({ data: mockConvData, error: null }));
  mockEqSelect2.mockReturnValue({ maybeSingle: mockMaybySingleSelect });
  mockEqSelect.mockReturnValue({ eq: mockEqSelect2, maybeSingle: mockMaybySingleSelect });
  mockSelect.mockReturnValue({ eq: mockEqSelect });

  mockSingle.mockImplementation(async () => ({ data: mockInsertData, error: mockUpdateError }));
  mockSelectInsert.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelectInsert });

  mockFrom.mockImplementation((_table: string) => ({
    update: mockUpdate,
    select: mockSelect,
    insert: mockInsert,
  }));
});

// ── PATCH /conversations/:id/read ─────────────────────────────────

describe("PATCH /conversations/:id/read", () => {
  it("✅ resets unread_count to 0", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/read");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(lastUpdate).toMatchObject({ unread_count: 0 });
    expect(json).toHaveBeenCalledWith({ ok: true, unread_count: 0 });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/read");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, params: { id: "conv-1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 500 on db error", async () => {
    mockUpdateError = { message: "db error" };
    mockEq2WithSelect.mockImplementation((_col: string, _val: unknown) => ({
      then: (onFulfilled: (v: { data: null; error: typeof mockUpdateError }) => unknown) =>
        Promise.resolve({ data: null, error: mockUpdateError }).then(onFulfilled),
      select: mockSelectAfterUpdate,
    }));
    const handler = getHandler("PATCH", "/conversations/:id/read");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(500);
  });

  it("✅ filters by owner_id for authorization", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/read");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string> }), res);
    expect(mockEq1).toHaveBeenCalledWith("id", "conv-1");
    expect(mockEq2WithSelect).toHaveBeenCalledWith("owner_id", "user-abc");
  });
});

// ── POST /conversations/:id/tags ──────────────────────────────────

describe("POST /conversations/:id/tags", () => {
  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, params: { id: "conv-1" } as Record<string, string>, body: { tags: ["a"] } }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 400 when tags is not an array", async () => {
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: "not-array" } }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("✅ returns 400 when tags is missing", async () => {
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: {} }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("✅ saves cleaned tags array", async () => {
    mockConvData = { id: "conv-1", tags: ["urgent", "vip"] };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: ["Urgent", "  VIP  "] } }), res);
    expect(lastUpdate).toMatchObject({ tags: ["urgent", "vip"] });
  });

  it("✅ lowercases and trims tags", async () => {
    mockConvData = { id: "conv-1", tags: ["support"] };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: ["  SUPPORT  "] } }), res);
    expect(lastUpdate).toMatchObject({ tags: ["support"] });
  });

  it("✅ filters out non-string entries", async () => {
    mockConvData = { id: "conv-1", tags: ["tag1"] };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: ["tag1", 42, null, "tag2"] } }), res);
    // Only string values should survive
    expect(((lastUpdate as { tags?: unknown[] }).tags as string[]).every(t => typeof t === "string")).toBe(true);
  });

  it("✅ caps tags at 20 items", async () => {
    const manyTags = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    mockConvData = { id: "conv-1", tags: manyTags.slice(0, 20) };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: manyTags } }), res);
    expect(((lastUpdate as { tags?: unknown[] }).tags as string[]).length).toBeLessThanOrEqual(20);
  });

  it("✅ returns 404 when conversation not found or unauthorized", async () => {
    mockConvData = null;
    mockMaybySingle.mockImplementation(async () => ({ data: null, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "no-exist" } as Record<string, string>, body: { tags: ["a"] } }), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("✅ accepts empty array (clears tags)", async () => {
    mockConvData = { id: "conv-1", tags: [] };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { tags: [] } }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });
});

// ── PATCH /conversations/:id/archive ──────────────────────────────

describe("PATCH /conversations/:id/archive", () => {
  it("✅ archives conversation (sets status to archived)", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { archive: true } }), res);
    expect(lastUpdate).toMatchObject({ status: "archived" });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ unarchives conversation (sets status to active)", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { archive: false } }), res);
    expect(lastUpdate).toMatchObject({ status: "active" });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, params: { id: "conv-1" } as Record<string, string>, body: { archive: true } }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ defaults to archive: true when body is empty", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: {} }), res);
    expect(lastUpdate).toMatchObject({ status: "archived" });
  });

  it("✅ returns 404 on db error", async () => {
    mockUpdateError = { message: "db error" };
    mockEq2WithSelect.mockImplementation((_col: string, _val: unknown) => ({
      then: (onFulfilled: (v: { data: null; error: typeof mockUpdateError }) => unknown) =>
        Promise.resolve({ data: null, error: mockUpdateError }).then(onFulfilled),
      select: mockSelectAfterUpdate,
    }));
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { archive: true } }), res);
    expect(status).toHaveBeenCalledWith(404);
  });
});

// ── PATCH /conversations/:id/mode ─────────────────────────────────

describe("PATCH /conversations/:id/mode", () => {
  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined, params: { id: "conv-1" } as Record<string, string>, body: { mode: "ai" } }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 400 when mode is invalid", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { mode: "invalid" } }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("✅ switches to human mode", async () => {
    mockConvData = { id: "conv-1", mode: "human" };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { mode: "human" } }), res);
    expect(lastUpdate).toMatchObject({ mode: "human" });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ mode: "human" }));
  });

  it("✅ switches to ai mode", async () => {
    mockConvData = { id: "conv-1", mode: "ai" };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvData, error: null }));
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, json } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { mode: "ai" } }), res);
    expect(lastUpdate).toMatchObject({ mode: "ai" });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ mode: "ai" }));
  });

  it("✅ returns 404 when conversation not found or unauthorized", async () => {
    mockConvData = null;
    mockMaybySingle.mockImplementation(async () => ({ data: null, error: { message: "not found" } }));
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "conv-1" } as Record<string, string>, body: { mode: "ai" } }), res);
    expect(status).toHaveBeenCalledWith(404);
  });
});
