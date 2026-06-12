// ─── conversations.reply.test.ts ──────────────────────────────────
// TDD TESTS for POST /conversations/:id/reply
//
// WHY these exist:
// → Reply requires authentication (401 on missing user)
// → Reply requires non-empty content (400 on empty)
// → Reply requires human mode — 409 if conversation is AI-mode
// → Reply saves message to DB and updates conversation preview
// → Reply returns 404 when conversation not owned by user
//
// SEALED FOREVER:
// → 401 when no user ✅
// → 400 when content missing or blank ✅
// → 404 when conversation not found or not owned ✅
// → 409 when conversation is in ai mode ✅
// → 200 with { message } on success ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Shared mock state ─────────────────────────────────────────────
let mockConvRow:   Record<string, unknown> | null = null;
let mockInsertRow: Record<string, unknown> | null = null;
let mockInsertErr: null | { message: string }     = null;
let lastInserted:  Record<string, unknown>        = {};

// Conversation select chain: select().eq().maybeSingle()
const mockMaybySingle = vi.fn().mockImplementation(async () => ({
  data: mockConvRow, error: null,
}));
const mockEqSelect = vi.fn().mockReturnValue({ maybySingle: mockMaybySingle, maybeSingle: mockMaybySingle });
const mockSelect   = vi.fn().mockReturnValue({ eq: mockEqSelect });

// Message insert chain: insert(vals).select(cols).single()
const mockSingle = vi.fn().mockImplementation(async () => ({
  data: mockInsertRow, error: mockInsertErr,
}));
const mockSelectInsert = vi.fn().mockReturnValue({ single: mockSingle });
const mockInsert = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
  lastInserted = vals;
  return { select: mockSelectInsert };
});

// Update chain (preview update — non-blocking void call)
const mockEqUpdate = vi.fn().mockReturnValue({
  then: (_fn: unknown) => Promise.resolve({ error: null }),
});
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate });

const mockFrom = vi.fn().mockImplementation((_table: string) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
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
    body:   { content: "Hello customer" },
    params: { id: "conv-1" } as Record<string, string>,
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

function getHandler(method: "POST", path: string) {
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
  mockConvRow  = {
    id: "conv-1", owner_id: "user-abc", channel: "web",
    channel_conversation_id: "sess-1", agent_id: "agent-1",
    mode: "human",
  };
  mockInsertRow = {
    id: "msg-1", role: "human", content: "Hello customer",
    created_at: new Date().toISOString(),
  };
  mockInsertErr = null;
  lastInserted  = {};
  vi.clearAllMocks();

  mockMaybySingle.mockImplementation(async () => ({ data: mockConvRow, error: null }));
  mockEqSelect.mockReturnValue({ maybySingle: mockMaybySingle, maybeSingle: mockMaybySingle });
  mockSelect.mockReturnValue({ eq: mockEqSelect });

  mockSingle.mockImplementation(async () => ({ data: mockInsertRow, error: mockInsertErr }));
  mockSelectInsert.mockReturnValue({ single: mockSingle });
  mockInsert.mockImplementation((vals: Record<string, unknown>) => {
    lastInserted = vals;
    return { select: mockSelectInsert };
  });

  mockEqUpdate.mockReturnValue({
    then: (_fn: unknown) => Promise.resolve({ error: null }),
  });
  mockUpdate.mockReturnValue({ eq: mockEqUpdate });

  mockFrom.mockImplementation((_table: string) => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }));
});

// ── POST /conversations/:id/reply ─────────────────────────────────

describe("POST /conversations/:id/reply", () => {
  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ returns 400 when content is missing", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("✅ returns 400 when content is blank whitespace", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq({ body: { content: "   " } }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("✅ returns 404 when conversation not found", async () => {
    mockConvRow = null;
    mockMaybySingle.mockImplementation(async () => ({ data: null, error: null }));
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("✅ returns 404 when conversation owned by different user", async () => {
    mockConvRow = { ...mockConvRow as Record<string, unknown>, owner_id: "other-user" };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvRow, error: null }));
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("✅ returns 409 when conversation is in AI mode", async () => {
    mockConvRow = { ...mockConvRow as Record<string, unknown>, mode: "ai" };
    mockMaybySingle.mockImplementation(async () => ({ data: mockConvRow, error: null }));
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(409);
  });

  it("✅ saves human reply to messages table on success", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res } = makeRes();
    await handler(makeReq(), res);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "human", content: "Hello customer", conversation_id: "conv-1" })
    );
  });

  it("✅ returns message object on success", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(json).toHaveBeenCalledWith({ message: mockInsertRow });
  });

  it("✅ returns 500 when insert fails", async () => {
    mockInsertErr = { message: "insert failed" };
    mockSingle.mockImplementation(async () => ({ data: null, error: mockInsertErr }));
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(500);
  });

  it("✅ trims whitespace from content before saving", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res } = makeRes();
    await handler(makeReq({ body: { content: "  Trimmed  " } }), res);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Trimmed" })
    );
  });
});
