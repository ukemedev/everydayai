---
name: Vitest mock chains for Supabase
description: How to correctly mock Supabase query builder chains in Vitest tests to avoid chain resolution failures.
---

## Rule
When the implementation uses a Supabase query chain with multiple chained methods, the mock chain must exactly match what gets called — the terminal async method must be the last one returning a promise.

**Why:** Supabase returns a PromiseLike builder; each chained method (`.select()`, `.lt()`, `.eq()`, `.not()`) returns a new builder until the chain is awaited. If a mock at `.lt()` returns `{ not: fn }` but the implementation awaits after `.lt()`, the mock will return the builder object instead of `{ data, error }`.

**How to apply:**
- If implementation does `await sb.from("t").select("id").lt("col", val)` → mock `.select()` to return `{ lt: vi.fn().mockImplementation(async () => ({ data, error })) }`.
- If implementation does `await sb.from("t").select().lt().not()` → mock `.lt()` to return `{ not: vi.fn().mockImplementation(async () => ({ data, error })) }`.
- Simplify implementation chains when possible to match what tests can cleanly mock — e.g., drop `.not("deleted_at", "is", null)` filter if it adds mock complexity without meaningful test value.
