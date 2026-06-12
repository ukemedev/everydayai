// ─── toolExecutor.test.ts ────────────────────────────────────────
// TDD TESTS for lib/toolExecutor.ts
//
// WHY these exist:
// → Seals custom_webhook execution behaviour forever
// → Proves executor never throws — always returns ExecutionResult
// → Proves URL validation rejects non-http(s) URLs
// → Proves timeout is handled gracefully (no crash)
// → Proves HTTP error responses are captured as failed result
// → Proves unknown connectors return structured failed result
//
// SEALED FOREVER:
// → custom_webhook: success → {status:'success', result: response body} ✅
// → custom_webhook: HTTP 4xx/5xx → {status:'failed', error: message} ✅
// → custom_webhook: no webhook_url → {status:'failed'} ✅
// → custom_webhook: bad URL scheme → {status:'failed'} ✅
// → custom_webhook: network error → {status:'failed'} ✅
// → custom_webhook: abort/timeout → {status:'failed'} ✅
// → unknown connector → {status:'failed', error includes connector id} ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../lib/toolExecutor.js";
import type { AgentToolInput, ExecutionContext } from "../lib/toolExecutor.js";

// ── Shared fixtures ───────────────────────────────────────────────

const CTX: ExecutionContext = {
  agentId:         "agent-123",
  conversationId:  "conv-456",
  customerMessage: "I want to book a slot",
  aiReply:         "Sure! I've noted your request.",
};

function makeTool(overrides: Partial<AgentToolInput> = {}): AgentToolInput {
  return {
    id:           "tool-1",
    connector_id: "custom_webhook",
    credentials:  { webhook_url: "https://hooks.example.com/test" },
    ...overrides,
  };
}

// ── Mock global fetch ─────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── custom_webhook — success ──────────────────────────────────────
describe("executeTool — custom_webhook success", () => {
  it("✅ returns success when webhook responds 200 with JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ received: true }),
      text: async () => '{"received":true}',
    });

    const result = await executeTool(makeTool(), CTX);

    expect(result.status).toBe("success");
    expect(result.result).toEqual({ received: true });
  });

  it("✅ POSTs correct payload shape to webhook URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({}),
      text: async () => "{}",
    });

    await executeTool(makeTool(), CTX);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/test");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).toMatchObject({
      agent_id:         "agent-123",
      conversation_id:  "conv-456",
      customer_message: "I want to book a slot",
      ai_reply:         "Sure! I've noted your request.",
    });
    expect(body.timestamp).toBeDefined();
  });

  it("✅ handles non-JSON response body gracefully", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:   true,
      json: async () => { throw new Error("not json"); },
      text: async () => "OK",
    });

    const result = await executeTool(makeTool(), CTX);
    expect(result.status).toBe("success");
  });
});

// ── custom_webhook — failures ─────────────────────────────────────
describe("executeTool — custom_webhook failures", () => {
  it("✅ returns failed when webhook_url is not configured", async () => {
    const result = await executeTool(makeTool({ credentials: {} }), CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("webhook_url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("✅ returns failed when webhook_url is empty string", async () => {
    const result = await executeTool(makeTool({ credentials: { webhook_url: "  " } }), CTX);
    expect(result.status).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("✅ returns failed when webhook_url has invalid scheme", async () => {
    const result = await executeTool(
      makeTool({ credentials: { webhook_url: "ftp://bad.example.com" } }),
      CTX,
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("http");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("✅ returns failed when webhook responds with HTTP 4xx", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:     false,
      status: 400,
      text:   async () => "Bad request",
    });

    const result = await executeTool(makeTool(), CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("400");
  });

  it("✅ returns failed when webhook responds with HTTP 5xx", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:     false,
      status: 503,
      text:   async () => "Service unavailable",
    });

    const result = await executeTool(makeTool(), CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("503");
  });

  it("✅ returns failed on network error — does not throw", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await executeTool(makeTool(), CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("✅ returns failed on AbortError (timeout) — does not throw", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortErr);

    const result = await executeTool(makeTool(), CTX);
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });
});

// ── unknown connector ─────────────────────────────────────────────
describe("executeTool — unknown connector", () => {
  it("✅ returns failed for an unknown connector id", async () => {
    const result = await executeTool(
      makeTool({ connector_id: "google_sheets" }),
      CTX,
    );
    expect(result.status).toBe("failed");
    expect(result.error).toContain("google_sheets");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("✅ error message includes the connector id for debugging", async () => {
    const result = await executeTool(
      makeTool({ connector_id: "totally_unknown_connector" }),
      CTX,
    );
    expect(result.error).toContain("totally_unknown_connector");
  });
});
