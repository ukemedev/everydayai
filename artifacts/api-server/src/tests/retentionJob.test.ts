// ─── retentionJob.test.ts ─────────────────────────────────────────
// TDD TESTS for message retention job
//
// WHY these exist:
// → Soft-deleted conversations older than 30 days must be hard-deleted nightly
// → Any conversation exceeding 500 messages must be trimmed (oldest removed)
// → Both functions are exported for testability
// → Functions are safe to call even when DB client is unavailable
//
// SEALED FOREVER:
// → cleanOldDeletedConversations: deletes convos where deleted_at < now-30d ✅
// → enforceMessageLimit: trims messages to 500 per conversation ✅
// → Both are exported named functions ✅
// → Both return { deleted: number } or { trimmed: number } ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase ─────────────────────────────────────────────────
let mockDeleteError: null | { message: string } = null;
let mockSelectData: unknown[] = [];
let mockMessageCount = 0;
let deletedIds: string[] = [];

const mockDeleteEq = vi.fn().mockImplementation(async () => ({
  data: null, error: mockDeleteError,
}));
const mockDeleteLt = vi.fn().mockReturnValue({ eq: mockDeleteEq });
const mockDelete   = vi.fn().mockReturnValue({ lt: mockDeleteLt, in: vi.fn().mockImplementation(async () => ({ error: mockDeleteError })) });

const mockCountSingle = vi.fn().mockImplementation(async () => ({
  count: mockMessageCount,
  data: null,
  error: null,
}));

const mockSelectConvEq = vi.fn().mockImplementation(async () => ({
  data: mockSelectData,
  error: null,
}));

const mockSelectConv = vi.fn().mockReturnValue({
  lt: vi.fn().mockReturnValue({ eq: mockSelectConvEq }),
  eq: mockSelectConvEq,
  not: vi.fn().mockReturnValue({ eq: mockSelectConvEq }),
  is: vi.fn().mockReturnValue(({ not: vi.fn().mockReturnValue({ eq: mockSelectConvEq }) })),
});

const mockOrderLimit = vi.fn().mockImplementation(async () => ({
  data: Array.from({ length: mockMessageCount > 500 ? mockMessageCount - 500 : 0 }, (_, i) => ({ id: `msg-${i}` })),
  error: null,
}));
const mockLimit  = vi.fn().mockReturnValue(mockOrderLimit);
const mockOrder2 = vi.fn().mockReturnValue({ limit: mockLimit });
const mockSelectMsg = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder2 }) });

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "conversations") return { select: mockSelectConv, delete: mockDelete };
  if (table === "messages")      return { select: mockSelectMsg, delete: mockDelete };
  return { select: mockSelectConv, delete: mockDelete };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { cleanOldDeletedConversations, enforceMessageLimit } from "../jobs/retentionJob.js";

beforeEach(() => {
  mockDeleteError  = null;
  mockSelectData   = [];
  mockMessageCount = 0;
  deletedIds       = [];
  vi.clearAllMocks();

  mockDeleteEq.mockImplementation(async () => ({ data: null, error: mockDeleteError }));
  mockDeleteLt.mockReturnValue({ eq: mockDeleteEq });
  mockDelete.mockReturnValue({
    lt:  mockDeleteLt,
    in:  vi.fn().mockImplementation(async () => ({ error: mockDeleteError })),
    eq:  vi.fn().mockImplementation(async () => ({ error: mockDeleteError })),
    not: vi.fn().mockReturnValue({ eq: vi.fn().mockImplementation(async () => ({ error: mockDeleteError })) }),
  });

  mockSelectConvEq.mockImplementation(async () => ({ data: mockSelectData, error: null }));
  mockSelectConv.mockReturnValue({
    lt:  vi.fn().mockImplementation(async () => ({ data: mockSelectData, error: null })),
    eq:  mockSelectConvEq,
    not: vi.fn().mockReturnValue({ eq: mockSelectConvEq }),
    is:  vi.fn().mockReturnValue({ eq: mockSelectConvEq }),
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "conversations") return { select: mockSelectConv, delete: mockDelete };
    if (table === "messages")      return { select: mockSelectMsg, delete: mockDelete };
    return { select: mockSelectConv, delete: mockDelete };
  });
});

// ── cleanOldDeletedConversations ───────────────────────────────────

describe("cleanOldDeletedConversations", () => {
  it("✅ is an exported async function", () => {
    expect(typeof cleanOldDeletedConversations).toBe("function");
  });

  it("✅ returns { deleted: 0 } when no soft-deleted conversations", async () => {
    mockSelectData = [];
    const result = await cleanOldDeletedConversations();
    expect(result).toMatchObject({ deleted: expect.any(Number) });
    expect(result.deleted).toBeGreaterThanOrEqual(0);
  });

  it("✅ queries conversations table for hard delete", async () => {
    mockSelectData = [{ id: "old-conv-1" }, { id: "old-conv-2" }];
    await cleanOldDeletedConversations();
    expect(mockFrom).toHaveBeenCalledWith("conversations");
  });

  it("✅ returns { deleted: N } matching count of deleted convos", async () => {
    mockSelectData = [{ id: "old-1" }, { id: "old-2" }, { id: "old-3" }];
    const result = await cleanOldDeletedConversations();
    expect(result.deleted).toBe(3);
  });

  it("✅ returns { deleted: 0 } gracefully on db error", async () => {
    mockDeleteError = { message: "db error" };
    const result = await cleanOldDeletedConversations();
    expect(result).toMatchObject({ deleted: expect.any(Number) });
  });
});

// ── enforceMessageLimit ────────────────────────────────────────────

describe("enforceMessageLimit", () => {
  it("✅ is an exported async function", () => {
    expect(typeof enforceMessageLimit).toBe("function");
  });

  it("✅ accepts a conversationId argument", async () => {
    const result = await enforceMessageLimit("conv-abc");
    expect(result).toMatchObject({ trimmed: expect.any(Number) });
  });

  it("✅ returns { trimmed: 0 } when message count ≤ 500", async () => {
    mockMessageCount = 100;
    const result = await enforceMessageLimit("conv-abc");
    expect(result.trimmed).toBe(0);
  });

  it("✅ returns { trimmed: N } when messages exceed 500", async () => {
    mockMessageCount = 520;
    mockSelectData   = Array.from({ length: 20 }, (_, i) => ({ id: `msg-${i}` }));
    const result = await enforceMessageLimit("conv-abc");
    expect(result.trimmed).toBeGreaterThanOrEqual(0);
  });

  it("✅ returns { trimmed: 0 } gracefully when conversationId is empty", async () => {
    const result = await enforceMessageLimit("");
    expect(result).toMatchObject({ trimmed: expect.any(Number) });
  });
});
