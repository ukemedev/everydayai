---
name: ioredis mock pattern for Vitest
description: How to mock ioredis in Vitest — direct vi.mock("ioredis") fails due to CJS interop; use a thin wrapper instead.
---

## Rule
Never mock `ioredis` directly in Vitest. Instead, create a thin `src/lib/redisClient.ts` that exports `getRedisClient()`, and mock that module.

**Why:** ioredis v5 uses `module.exports = Redis` (the class itself as the CJS default). Vitest's ESM interop causes `vi.mock("ioredis", () => ({ Redis: MockRedis }))` to silently fail — the real Redis constructor is used, immediately throws (no server in test env), and the catch block triggers fail-open. The symptom is `result.current === 0` when 1 is expected, because the catch path always returns `{ allowed: true, current: 0, limit }`.

**How to apply:**
- `src/lib/redisClient.ts` exports `getRedisClient(url: string): Redis` — one line wrapping `new Redis(url, opts)`.
- `planLimits.ts` calls `getRedisClient(redisUrl)` instead of `new Redis(...)`.
- Tests mock `"../lib/redisClient.js"` → `{ getRedisClient: mockGetRedisClient }`.
- In `beforeEach`: `mockGetRedisClient.mockReturnValue({ incr: mockIncr, expire: mockExpire, decr: mockDecr })`.
- Use `mockReset()` (not `clearAllMocks()`) in `beforeEach` to reliably clear both history AND implementation, then re-apply everything explicitly. `clearAllMocks()` only clears history and can leave the mock in a confusing state when re-initializing constructors.
- All mock functions must be created via `vi.hoisted()` when referenced inside `vi.mock()` factories.
