import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeTool } from "../lib/toolExecutor.js";
import type { AgentToolInput, ExecutionContext } from "../lib/toolExecutor.js";

const CTX: ExecutionContext = {
  agentId:         "agent-123",
  conversationId:  "conv-456",
  customerMessage: "I want to book a slot",
  aiReply:         "Sure! I've noted your request.",
};

function makeTool(overrides: Partial<AgentToolInput> = {}): AgentToolInput {
  return {
    id:          "tool-1",
    name:        "Booking Webhook",
    webhook_url: "https://hooks.example.com/test",
    secret:      null,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── success ───────────────────────────────────────────────────────

describe("executeTool — success", () => {
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

  it("✅ sends X-EverydayAI-Secret header when secret is configured", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({}),
      text: async () => "{}",
    });

    await executeTool(makeTool({ secret: "my-secret" }), CTX);

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["X-EverydayAI-Secret"]).toBe("my-secret");
  });

  it("✅ does NOT send secret header when secret is null", async () => {
    fetchMock.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({}),
      text: async () => "{}",
    });

    await executeTool(makeTool({ secret: null }), CTX);

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["X-EverydayAI-Secret"]).toBeUndefined();
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

// ── failures ──────────────────────────────────────────────────────

describe("executeTool — failures", () => {
  it("✅ returns failed when webhook_url has invalid scheme", async () => {
    const result = await executeTool(
      makeTool({ webhook_url: "ftp://bad.example.com" }),
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