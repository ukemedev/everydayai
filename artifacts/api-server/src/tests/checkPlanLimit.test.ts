// ─── checkPlanLimit.test.ts ───────────────────────────────────────
// TDD TESTS for Redis-backed plan limit gate
//
// WHY these exist:
// → Free trial users were getting silence when the limit was hit.
//   Backend sent PLAN_LIMIT_REACHED but the frontend only handled
//   MESSAGE_LIMIT_REACHED — error code mismatch = silent failure.
// → This seals the correct behavior forever.
//
// MOCK STRATEGY:
// → ioredis exports via `module.exports = Redis` (CJS default-as-module)
//   which means vi.mock("ioredis") fights CJS/ESM interop issues.
// → Instead, planLimits.ts uses getRedisClient() from redisClient.ts —
//   a thin factory we mock directly. No interop problems.
//
// SEALED FOREVER:
// → FREE_TRIAL_LIMIT constant = 20                                  ✅
// → UPGRADE_MESSAGE constant exact wording                          ✅
// → Free user, 1st message            → allowed: true, current=1   ✅
// → Free user, exactly at limit (20)  → allowed: true, current=20  ✅
// → Free user, 1 over limit (21)      → allowed: false + UPGRADE_MESSAGE ✅
// → Free user, well over limit        → allowed: false              ✅
// → First message → Redis EXPIRE set with 30-day TTL               ✅
// → Non-first message → EXPIRE not called again                     ✅
// → Blocked request → Redis DECR reverses the increment            ✅
// → Redis key pattern = usage:userId:messages                       ✅
// → Business user → always allowed, Redis skipped                   ✅
// → Redis throws → fail-open (allowed)                              ✅
// → No REDIS_URL → fail-open, Redis not called                      ✅
// → DB error → assume free plan, still check Redis                  ✅
// → DB error + over limit → still blocked                           ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── vi.hoisted: all mocks created before vi.mock factories run ─────
const { mockIncr, mockExpire, mockDecr, mockGetRedisClient, mockSingle, MockCreateClient } =
  vi.hoisted(() => ({
    mockIncr:          vi.fn(),
    mockExpire:        vi.fn(),
    mockDecr:          vi.fn(),
    mockGetRedisClient: vi.fn(),
    mockSingle:        vi.fn(),
    MockCreateClient:  vi.fn(),
  }));

// ── Module mocks ───────────────────────────────────────────────────
// Mock the thin redisClient wrapper — avoids ioredis CJS/ESM interop
vi.mock("../lib/redisClient.js", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: MockCreateClient }));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/email.js", () => ({
  sendEmail: vi.fn(), isEmailConfigured: () => false,
}));

vi.mock("../lib/emails/limitWarning.js", () => ({
  limitWarningEmailHtml:    vi.fn().mockReturnValue(""),
  limitWarningEmailSubject: vi.fn().mockReturnValue(""),
  limitReachedEmailHtml:    vi.fn().mockReturnValue(""),
  limitReachedEmailSubject: vi.fn().mockReturnValue(""),
}));

// ── Import AFTER mocks ─────────────────────────────────────────────
import { checkPlanLimit, FREE_TRIAL_LIMIT, UPGRADE_MESSAGE } from "../lib/planLimits.js";

// ── Per-test helpers ───────────────────────────────────────────────

function whenIncrReturns(n: number) {
  mockIncr.mockResolvedValue(n);
}

function whenRedisFails() {
  mockIncr.mockRejectedValue(new Error("Redis connection refused"));
}

function whenPlanIs(plan: string) {
  mockSingle.mockResolvedValue({ data: { plan }, error: null });
}

function whenDbFails() {
  mockSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });
}

// ── beforeEach: reset → re-initialise every mock ──────────────────
beforeEach(() => {
  // mockReset clears both call history AND implementations.
  // We re-apply everything immediately after.
  mockGetRedisClient.mockReset();
  mockIncr.mockReset();
  mockExpire.mockReset();
  mockDecr.mockReset();
  MockCreateClient.mockReset();
  mockSingle.mockReset();

  // getRedisClient() returns the mock Redis client
  mockGetRedisClient.mockReturnValue({
    incr:   mockIncr,
    expire: mockExpire,
    decr:   mockDecr,
  });

  // Redis method defaults
  mockIncr.mockResolvedValue(1);
  mockExpire.mockResolvedValue(1);
  mockDecr.mockResolvedValue(0);

  // Supabase default: free-plan user
  MockCreateClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: mockSingle }),
      }),
    }),
  });
  mockSingle.mockResolvedValue({ data: { plan: "free" }, error: null });

  // Environment
  vi.stubEnv("REDIS_URL",                 "redis://localhost:6379");
  vi.stubEnv("SUPABASE_URL",              "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Exported constants ─────────────────────────────────────────────

describe("exported constants", () => {

  it("✅ FREE_TRIAL_LIMIT is 20", () => {
    expect(FREE_TRIAL_LIMIT).toBe(20);
  });

  it("✅ UPGRADE_MESSAGE is exact wording", () => {
    expect(UPGRADE_MESSAGE).toBe(
      "You've used your free messages. Upgrade to continue."
    );
  });

});

// ── Free trial user ────────────────────────────────────────────────

describe("free trial user", () => {

  it("✅ first message (INCR=1) → allowed, current=1", async () => {
    whenIncrReturns(1);
    const result = await checkPlanLimit("user-1");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(FREE_TRIAL_LIMIT);
  });

  it("✅ 20th message (exactly at limit) → allowed, current=20", async () => {
    whenIncrReturns(FREE_TRIAL_LIMIT);
    const result = await checkPlanLimit("user-2");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(FREE_TRIAL_LIMIT);
    expect(result.limit).toBe(FREE_TRIAL_LIMIT);
  });

  it("❌ 21st message (one over limit) → blocked with UPGRADE_MESSAGE", async () => {
    whenIncrReturns(FREE_TRIAL_LIMIT + 1);
    const result = await checkPlanLimit("user-3");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toBe(UPGRADE_MESSAGE);
      expect(result.current).toBe(FREE_TRIAL_LIMIT);   // INCR reversed
      expect(result.limit).toBe(FREE_TRIAL_LIMIT);
    }
  });

  it("❌ well over limit (INCR=50) → blocked", async () => {
    whenIncrReturns(50);
    const result = await checkPlanLimit("user-4");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toBe(UPGRADE_MESSAGE);
    }
  });

  it("✅ first message (INCR=1) → EXPIRE set with 30-day TTL", async () => {
    whenIncrReturns(1);
    await checkPlanLimit("user-expire");
    expect(mockExpire).toHaveBeenCalledWith(
      "usage:user-expire:messages",
      30 * 24 * 60 * 60
    );
  });

  it("✅ non-first message (INCR=5) → EXPIRE not called", async () => {
    whenIncrReturns(5);
    await checkPlanLimit("user-no-expire");
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("✅ blocked request (INCR=21) → DECR called to reverse increment", async () => {
    whenIncrReturns(FREE_TRIAL_LIMIT + 1);
    await checkPlanLimit("user-decr");
    expect(mockDecr).toHaveBeenCalledWith("usage:user-decr:messages");
  });

  it("✅ Redis key = usage:userId:messages", async () => {
    whenIncrReturns(1);
    await checkPlanLimit("abc-123");
    expect(mockIncr).toHaveBeenCalledWith("usage:abc-123:messages");
  });

});

// ── Unlimited plan (business) ──────────────────────────────────────

describe("unlimited plan (business)", () => {

  it("✅ business user → allowed, Redis never called", async () => {
    whenPlanIs("business");
    const result = await checkPlanLimit("user-biz");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(Infinity);
    expect(mockGetRedisClient).not.toHaveBeenCalled();
  });

});

// ── Redis unavailable → fail-open ──────────────────────────────────

describe("Redis unavailable — fail-open", () => {

  it("✅ Redis INCR throws → fail-open (allowed)", async () => {
    whenRedisFails();
    const result = await checkPlanLimit("user-redis-fail");
    expect(result.allowed).toBe(true);
  });

  it("✅ No REDIS_URL → fail-open, getRedisClient never called", async () => {
    vi.stubEnv("REDIS_URL", "");
    const result = await checkPlanLimit("user-no-redis");
    expect(result.allowed).toBe(true);
    expect(mockGetRedisClient).not.toHaveBeenCalled();
  });

});

// ── DB unavailable → assume free plan ─────────────────────────────

describe("DB unavailable — assume free plan", () => {

  it("✅ DB error + within limit → allowed (assumed free)", async () => {
    whenDbFails();
    whenIncrReturns(1);
    const result = await checkPlanLimit("user-db-fail-1");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(FREE_TRIAL_LIMIT);
    expect(mockIncr).toHaveBeenCalled();
  });

  it("✅ DB error + over limit → still blocked", async () => {
    whenDbFails();
    whenIncrReturns(FREE_TRIAL_LIMIT + 1);
    const result = await checkPlanLimit("user-db-fail-2");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toBe(UPGRADE_MESSAGE);
    }
  });

});
