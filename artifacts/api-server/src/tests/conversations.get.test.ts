// ─── conversations.get.test.ts ────────────────────────────────────
// TDD TESTS for GET /api/conversations
//
// WHY these exist:
// → GET must exclude soft-deleted rows (deleted_at IS NULL filter)
// → GET supports search filter (ilike on customer_display)
// → GET supports status, channel, mode filters
// → GET requires authentication (401 on missing user)
// → GET returns { conversations, total, limit, offset }
//
// SEALED FOREVER:
// → GET /conversations excludes deleted rows via deleted_at IS NULL ✅
// → GET /conversations?search= applies ilike filter ✅
// → GET /conversations returns conversations array ✅
// → 401 when no user ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Shared mock state ─────────────────────────────────────────────
let mockData:  unknown[]                    = [];
let mockError: null | { message: string }  = null;
let mockCount: number                      = 0;

// Track what filter methods were called
let lastIsArgs:    [string, unknown] | null = null;
let lastIlikeArgs: [string, string]  | null = null;
const eqCalls: Array<[string, unknown]>    = [];

// ── Query chain mock ──────────────────────────────────────────────
// Each chained method records its call and returns the same chain object.
// The chain object is also a thenable — await-ing it returns the result.
const chain: Record<string, unknown> = {};

chain.eq    = vi.fn().mockImplementation((col: string, val: unknown)  => { eqCalls.push([col, val]);           return chain; });
chain.is    = vi.fn().mockImplementation((col: string, val: unknown)  => { lastIsArgs    = [col, val];          return chain; });
chain.ilike = vi.fn().mockImplementation((col: string, pat: string)   => { lastIlikeArgs = [col, pat];          return chain; });
chain.order = vi.fn().mockReturnValue(chain);
chain.range = vi.fn().mockReturnValue(chain);
// Thenable so `await chain` works — reads current mock state at call time
(chain as { then: unknown }).then = function(
  onFulfilled: (v: { data: unknown[]; error: typeof mockError; count: number }) => unknown
) {
  return Promise.resolve({ data: mockData, error: mockError, count: mockCount }).then(onFulfilled);
};

const mockSelect = vi.fn().mockReturnValue(chain);
const mockFrom   = vi.fn().mockImplementation((_table: string) => ({
  select: mockSelect,
  update: vi.fn().mockReturnValue(chain),
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

function getHandler(method: "GET", path: string) {
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
  mockData  = [];
  mockError = null;
  mockCount = 0;
  lastIsArgs    = null;
  lastIlikeArgs = null;
  eqCalls.length = 0;
  vi.clearAllMocks();
  // Re-wire mocks after clearAllMocks
  (chain.eq    as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown)  => { eqCalls.push([col, val]); return chain; });
  (chain.is    as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown)  => { lastIsArgs    = [col, val]; return chain; });
  (chain.ilike as ReturnType<typeof vi.fn>).mockImplementation((col: string, pat: string)   => { lastIlikeArgs = [col, pat]; return chain; });
  (chain.order as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  (chain.range as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockFrom.mockImplementation((_table: string) => ({
    select: mockSelect,
    update: vi.fn().mockReturnValue(chain),
  }));
});

// ── GET /conversations ─────────────────────────────────────────────

describe("GET /conversations", () => {
  it("✅ returns 401 when no user", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq({ user: undefined }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it("✅ calls select on conversations table", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq(), res);
    expect(mockFrom).toHaveBeenCalledWith("conversations");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("✅ applies deleted_at IS NULL filter to exclude soft-deleted rows", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq(), res);
    expect(lastIsArgs).toEqual(["deleted_at", null]);
  });

  it("✅ filters by owner_id for user isolation", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq(), res);
    const ownerCall = eqCalls.find(([col]) => col === "owner_id");
    expect(ownerCall?.[1]).toBe("user-abc");
  });

  it("✅ defaults status filter to active", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: {} as Record<string, string> }), res);
    const statusCall = eqCalls.find(([col]) => col === "status");
    expect(statusCall?.[1]).toBe("active");
  });

  it("✅ returns conversations array on success", async () => {
    mockData  = [{ id: "c1", customer_display: "Alice", unread_count: 0 }];
    mockCount = 1;
    const handler = getHandler("GET", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ conversations: mockData }));
  });

  it("✅ returns 500 on db error", async () => {
    mockError = { message: "db err" };
    const handler = getHandler("GET", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(500);
  });

  it("✅ applies channel eq filter when channel param provided", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: { channel: "whatsapp" } as Record<string, string> }), res);
    const ch = eqCalls.find(([col]) => col === "channel");
    expect(ch?.[1]).toBe("whatsapp");
  });

  it("✅ applies mode eq filter when mode param provided", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: { mode: "human" } as Record<string, string> }), res);
    const m = eqCalls.find(([col]) => col === "mode");
    expect(m?.[1]).toBe("human");
  });

  it("✅ does NOT apply channel filter when channel not provided", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq(), res);
    expect(eqCalls.find(([col]) => col === "channel")).toBeUndefined();
  });

  it("✅ applies ilike search filter on customer_display when search provided", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: { search: "Alice" } as Record<string, string> }), res);
    expect(lastIlikeArgs).toEqual(["customer_display", "%Alice%"]);
  });

  it("✅ does NOT apply ilike when search is empty string", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: { search: "" } as Record<string, string> }), res);
    expect(lastIlikeArgs).toBeNull();
  });

  it("✅ trims whitespace from search before applying ilike", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res } = makeRes();
    await handler(makeReq({ query: { search: "  Bob  " } as Record<string, string> }), res);
    expect(lastIlikeArgs).toEqual(["customer_display", "%Bob%"]);
  });

  it("✅ respects custom limit (parsed correctly)", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq({ query: { limit: "25" } as Record<string, string> }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it("✅ caps limit at 100", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq({ query: { limit: "999" } as Record<string, string> }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("✅ returns total count from db", async () => {
    mockCount = 42;
    const handler = getHandler("GET", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq(), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ total: 42 }));
  });

  it("✅ returns offset in response", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res, json } = makeRes();
    await handler(makeReq({ query: { offset: "20" } as Record<string, string> }), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
  });
});
