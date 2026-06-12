// ─── toolRunner.test.ts ──────────────────────────────────────────
// TDD TESTS for lib/toolRunner.ts
//
// WHY these exist:
// → Seals the full orchestration pipeline: fetch → evaluate → execute → log
// → Proves no crash when agent has no active tools
// → Proves trigger evaluation gates execution correctly
// → Proves tool_executions is written with correct shape on success
// → Proves tool_executions captures failure correctly
// → Proves one tool failure does not stop other tools from running
// → Proves Supabase fetch error is handled gracefully (no crash)
//
// SEALED FOREVER:
// → No active tools → returns without calling executeTool ✅
// → Trigger fires → executeTool called, tool_executions inserted ✅
// → Trigger does not fire → executeTool NOT called ✅
// → Execution success → tool_executions.status = 'success' ✅
// → Execution failure → tool_executions.status = 'failed' ✅
// → Supabase fetch error → logs warn, returns cleanly ✅
// → One tool crashes → other tools still execute ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock evaluateTrigger ──────────────────────────────────────────
const mockEvaluateTrigger = vi.hoisted(() => vi.fn());
vi.mock("../lib/triggerEvaluator.js", () => ({
  evaluateTrigger: mockEvaluateTrigger,
}));

// ── Mock executeTool ──────────────────────────────────────────────
const mockExecuteTool = vi.hoisted(() => vi.fn());
vi.mock("../lib/toolExecutor.js", () => ({
  executeTool: mockExecuteTool,
}));

// ── Import SUT after mocks ────────────────────────────────────────
import { runAgentTools } from "../lib/toolRunner.js";

// ── Supabase mock builder ─────────────────────────────────────────

interface MockToolRow {
  id:             string;
  agent_id:       string;
  connector_id:   string;
  credentials:    Record<string, unknown>;
  trigger_type:   string;
  trigger_config: object;
  status:         string;
}

function makeSupabaseMock(opts: {
  fetchRows?:  MockToolRow[];
  fetchError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const insertFn = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });

  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  // Resolve the full chain
  selectChain.eq = vi.fn().mockImplementation(() => selectChain);
  // The final .eq call returns a promise-like
  const resolvedValue = { data: opts.fetchRows ?? [], error: opts.fetchError ?? null };
  selectChain.eq = vi.fn().mockReturnValue(
    new Proxy(selectChain, {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(resolvedValue);
        }
        // nested .eq returns self
        if (prop === "eq") return target.eq;
        return (target as Record<string, unknown>)[prop as string];
      },
    })
  );

  // Build proper chainable mock
  const eqFinal = vi.fn().mockResolvedValue(resolvedValue);
  const eqFirst = vi.fn().mockReturnValue({ eq: eqFinal });
  const selectMock = vi.fn().mockReturnValue({ eq: eqFirst });

  const insertChain = {
    catch: vi.fn().mockResolvedValue({ error: null }),
  };
  const insertMock = vi.fn().mockReturnValue(insertChain);

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "agent_tools") return { select: selectMock };
    if (table === "tool_executions") return { insert: insertMock };
    return {};
  });

  return { from: fromMock, _insertMock: insertMock, _eqFirst: eqFirst, _eqFinal: eqFinal };
}

// ── Fixtures ──────────────────────────────────────────────────────

const AGENT_ID      = "agent-abc";
const CONV_ID       = "conv-xyz";
const CUSTOMER_MSG  = "I want to book a slot";
const AI_REPLY      = "Great! I've noted your request.";

function makeToolRow(overrides: Partial<MockToolRow> = {}): MockToolRow {
  return {
    id:             "tool-row-1",
    agent_id:       AGENT_ID,
    connector_id:   "custom_webhook",
    credentials:    { webhook_url: "https://hooks.example.com" },
    trigger_type:   "always",
    trigger_config: {},
    status:         "active",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── No tools ──────────────────────────────────────────────────────
describe("runAgentTools — no active tools", () => {
  it("✅ returns without calling executeTool when no rows returned", async () => {
    const sb = makeSupabaseMock({ fetchRows: [] });
    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("✅ handles Supabase fetch error gracefully — no crash", async () => {
    const sb = makeSupabaseMock({ fetchError: { message: "DB error" } });
    await expect(
      runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never)
    ).resolves.toBeUndefined();
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});

// ── Trigger evaluation ────────────────────────────────────────────
describe("runAgentTools — trigger evaluation", () => {
  it("✅ calls executeTool when trigger fires", async () => {
    mockEvaluateTrigger.mockReturnValue(true);
    mockExecuteTool.mockResolvedValue({ status: "success", result: {} });
    const sb = makeSupabaseMock({ fetchRows: [makeToolRow()] });

    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);

    expect(mockExecuteTool).toHaveBeenCalledOnce();
  });

  it("✅ does NOT call executeTool when trigger does not fire", async () => {
    mockEvaluateTrigger.mockReturnValue(false);
    const sb = makeSupabaseMock({ fetchRows: [makeToolRow()] });

    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);

    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("✅ passes correct args to evaluateTrigger", async () => {
    mockEvaluateTrigger.mockReturnValue(false);
    const tool = makeToolRow({ trigger_type: "keyword", trigger_config: { keywords: ["book"] } });
    const sb = makeSupabaseMock({ fetchRows: [tool] });

    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);

    expect(mockEvaluateTrigger).toHaveBeenCalledWith(
      "keyword",
      { keywords: ["book"] },
      CUSTOMER_MSG,
      AI_REPLY,
    );
  });
});

// ── Audit log — success ───────────────────────────────────────────
describe("runAgentTools — audit log on success", () => {
  it("✅ inserts tool_executions row with status=success", async () => {
    mockEvaluateTrigger.mockReturnValue(true);
    mockExecuteTool.mockResolvedValue({ status: "success", result: { ok: true } });
    const sb = makeSupabaseMock({ fetchRows: [makeToolRow()] });

    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);

    expect(sb._insertMock).toHaveBeenCalledOnce();
    const insertArg = sb._insertMock.mock.calls[0][0];
    expect(insertArg.status).toBe("success");
    expect(insertArg.agent_id).toBe(AGENT_ID);
    expect(insertArg.conversation_id).toBe(CONV_ID);
    expect(insertArg.trigger_type).toBe("always");
  });
});

// ── Audit log — failure ───────────────────────────────────────────
describe("runAgentTools — audit log on failure", () => {
  it("✅ inserts tool_executions row with status=failed on executor failure", async () => {
    mockEvaluateTrigger.mockReturnValue(true);
    mockExecuteTool.mockResolvedValue({ status: "failed", error: "Connector not implemented." });
    const sb = makeSupabaseMock({ fetchRows: [makeToolRow()] });

    await runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never);

    expect(sb._insertMock).toHaveBeenCalledOnce();
    const insertArg = sb._insertMock.mock.calls[0][0];
    expect(insertArg.status).toBe("failed");
    expect(insertArg.error_message).toContain("not implemented");
  });
});

// ── Multi-tool isolation ──────────────────────────────────────────
describe("runAgentTools — multi-tool isolation", () => {
  it("✅ executes second tool even if first tool's executeTool throws", async () => {
    mockEvaluateTrigger.mockReturnValue(true);
    mockExecuteTool
      .mockRejectedValueOnce(new Error("tool 1 crashed"))
      .mockResolvedValueOnce({ status: "success" });

    const tools = [
      makeToolRow({ id: "t1", connector_id: "custom_webhook" }),
      makeToolRow({ id: "t2", connector_id: "custom_webhook" }),
    ];
    const sb = makeSupabaseMock({ fetchRows: tools });

    await expect(
      runAgentTools(AGENT_ID, CONV_ID, CUSTOMER_MSG, AI_REPLY, sb as never)
    ).resolves.toBeUndefined();

    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
  });
});
