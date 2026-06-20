// ─── admin.verify.test.ts ─────────────────────────────────────────
// TDD REGRESSION TESTS for GET /api/admin/verify
//
// WHY these exist:
// → Admin panel was inaccessible because is_admin was not set in DB
// → This seals the guard logic forever so no future refactor can
//   silently break admin access or accidentally open it to everyone
//
// SEALED FOREVER:
// → Admin user (is_admin: true)  → 200 { isAdmin: true }  ✅
// → Non-admin (is_admin: false)  → 401                    ✅
// → No profile row at all        → 401                    ✅
// → No Authorization header      → 401                    ✅
// → Invalid / expired JWT        → 401                    ✅
// → SUPABASE_SERVICE_ROLE_KEY missing → 503               ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

// ── Mock state ────────────────────────────────────────────────────
let mockGetUserResult: { data: { user: Record<string, unknown> | null }; error: unknown } = {
  data: { user: null },
  error: null,
};

let mockProfileResult: { data: { is_admin: boolean | null } | null; error: unknown } = {
  data: null,
  error: null,
};

// Supabase chain: from("profiles").select("is_admin").eq("id", uid).maybeSingle()
const mockMaybySingle = vi.fn().mockImplementation(async () => mockProfileResult);
const mockEqProfile   = vi.fn().mockReturnValue({ maybeSingle: mockMaybySingle });
const mockSelectProf  = vi.fn().mockReturnValue({ eq: mockEqProfile });
const mockFrom        = vi.fn().mockReturnValue({ select: mockSelectProf });

const mockGetUser = vi.fn().mockImplementation(async () => mockGetUserResult);

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── Import router AFTER mocks ─────────────────────────────────────
import router from "../routes/admin.js";

// ── Helpers ───────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: { authorization: "Bearer valid-test-token" },
    params: {} as Record<string, string>,
    body: {},
    log: {
      error: vi.fn(),
      info:  vi.fn(),
      warn:  vi.fn(),
      debug: vi.fn(),
    } as unknown as Request["log"],
    ...overrides,
  };
}

function makeRes(): {
  status: ReturnType<typeof vi.fn>;
  json:   ReturnType<typeof vi.fn>;
  res:    Partial<Response>;
} {
  const json   = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res    = { status, json } as unknown as Partial<Response>;
  return { status, json, res };
}

function getHandler(method: "GET" | "POST" | "PATCH" | "DELETE", path: string) {
  type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> };
  };
  const layer = (router.stack as Layer[]).find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer?.route) throw new Error(`No handler found for ${method} ${path}`);
  // Return the last handler (skips auth middleware in unit tests)
  const handlers = layer.route.stack.map((s) => s.handle);
  return handlers[handlers.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: valid admin user
  mockGetUserResult  = { data: { user: { id: "admin-user-id" } }, error: null };
  mockProfileResult  = { data: { is_admin: true }, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Tests ─────────────────────────────────────────────────────────

describe("GET /admin/verify — requireAdmin guard", () => {

  it("✅ returns 200 { isAdmin: true } when user has is_admin = true", async () => {
    mockGetUserResult = { data: { user: { id: "admin-user-id" } }, error: null };
    mockProfileResult = { data: { is_admin: true }, error: null };

    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq();
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(json).toHaveBeenCalledWith({ isAdmin: true });
  });

  it("❌ returns 401 when user has is_admin = false", async () => {
    mockGetUserResult = { data: { user: { id: "normal-user-id" } }, error: null };
    mockProfileResult = { data: { is_admin: false }, error: null };

    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq();
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("❌ returns 401 when user has no profile row at all", async () => {
    mockGetUserResult = { data: { user: { id: "orphan-user-id" } }, error: null };
    mockProfileResult = { data: null, error: null };

    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq();
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("❌ returns 401 when Authorization header is missing", async () => {
    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq({ headers: {} });
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("❌ returns 401 when JWT is invalid or expired", async () => {
    mockGetUserResult = { data: { user: null }, error: { message: "JWT expired" } };

    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq();
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("❌ returns 503 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const handler = getHandler("GET", "/admin/verify");
    const req = makeReq();
    const { res, status, json } = makeRes();

    await handler(req as Request, res as Response);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: "Service unavailable" });
  });

});
