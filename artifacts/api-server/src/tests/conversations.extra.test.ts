// ─── conversations.extra.test.ts ──────────────────────────────────
// Supplemental edge-case tests to reach coverage target
//
// WHY these exist:
// → All main endpoints return 503 when service client is unavailable
//   (i.e. VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is empty)
//
// SEALED FOREVER:
// → 503 on missing env vars for GET, PATCH read, POST tags, DELETE, mode, archive, reply ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

// ── Chain mock (returned by from()) ──────────────────────────────
const chain: Record<string, unknown> = {};
chain.eq    = vi.fn().mockReturnValue(chain);
chain.is    = vi.fn().mockReturnValue(chain);
chain.ilike = vi.fn().mockReturnValue(chain);
chain.order = vi.fn().mockReturnValue(chain);
chain.range = vi.fn().mockReturnValue(chain);
chain.select = vi.fn().mockReturnValue(chain);
chain.maybeSingle = vi.fn().mockImplementation(async () => ({ data: null, error: null }));
chain.single      = vi.fn().mockImplementation(async () => ({ data: null, error: null }));
(chain as { then: unknown }).then = function(
  onFulfilled: (v: { data: unknown; error: unknown; count: number }) => unknown
) {
  return Promise.resolve({ data: null, error: null, count: 0 }).then(onFulfilled);
};

const mockUpdate = vi.fn().mockReturnValue(chain);
const mockSelect = vi.fn().mockReturnValue(chain);
const mockInsert = vi.fn().mockReturnValue(chain);
const mockFrom   = vi.fn().mockReturnValue({ select: mockSelect, update: mockUpdate, insert: mockInsert });

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

// ── Save / restore env vars around each 503 test ─────────────────
let savedUrl: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  savedUrl = process.env.VITE_SUPABASE_URL;
  savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Blank env vars → getServiceClient() returns null → 503
  process.env.VITE_SUPABASE_URL         = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
});

afterEach(() => {
  process.env.VITE_SUPABASE_URL         = savedUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
});

// ── 503 tests ─────────────────────────────────────────────────────

describe("503 — service client unavailable (empty env vars)", () => {
  it("✅ GET /conversations returns 503", async () => {
    const handler = getHandler("GET", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ PATCH /conversations/:id/read returns 503", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/read");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ POST /conversations/:id/tags returns 503", async () => {
    const handler = getHandler("POST", "/conversations/:id/tags");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string>, body: { tags: ["a"] } }), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ DELETE /conversations/:id returns 503", async () => {
    const handler = getHandler("DELETE", "/conversations/:id");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string> }), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ DELETE /conversations returns 503", async () => {
    const handler = getHandler("DELETE", "/conversations");
    const { res, status } = makeRes();
    await handler(makeReq(), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ PATCH /conversations/:id/mode returns 503", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/mode");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string>, body: { mode: "ai" } }), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ PATCH /conversations/:id/archive returns 503", async () => {
    const handler = getHandler("PATCH", "/conversations/:id/archive");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string>, body: { archive: true } }), res);
    expect(status).toHaveBeenCalledWith(503);
  });

  it("✅ POST /conversations/:id/reply returns 503", async () => {
    const handler = getHandler("POST", "/conversations/:id/reply");
    const { res, status } = makeRes();
    await handler(makeReq({ params: { id: "c1" } as Record<string, string>, body: { content: "hi" } }), res);
    expect(status).toHaveBeenCalledWith(503);
  });
});
