// ─── toolExecutor.ts ─────────────────────────────────────────────
// Executes a single webhook tool given its configuration and conversation context.
//
// GUARANTEES:
// → Never throws — always returns ExecutionResult
// → Webhook timeout: 10 seconds
// → Payload fields capped at 2000 chars each
// → Webhook URL validated before fetch
// ─────────────────────────────────────────────────────────────────

export interface AgentToolInput {
  id:          string;
  name:        string;
  webhook_url: string;
  secret:      string | null;
}

export interface ExecutionContext {
  agentId:         string;
  conversationId:  string;
  customerMessage: string;
  aiReply:         string;
}

export interface ExecutionResult {
  status:  "success" | "failed";
  result?: unknown;
  error?:  string;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

export async function executeTool(
  tool: AgentToolInput,
  ctx:  ExecutionContext,
): Promise<ExecutionResult> {
  const url = tool.webhook_url.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { status: "failed", error: "webhook_url must start with http:// or https://" };
  }

  const payload = {
    agent_id:         ctx.agentId,
    conversation_id:  ctx.conversationId,
    customer_message: ctx.customerMessage.slice(0, 2000),
    ai_reply:         ctx.aiReply.slice(0, 2000),
    timestamp:        new Date().toISOString(),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // If the user configured a signing secret, include it as a bearer token
  // so their receiving server can verify the request came from EverydayAI.
  if (tool.secret?.trim()) {
    headers["X-EverydayAI-Secret"] = tool.secret.trim();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        status: "failed",
        error:  `Webhook returned HTTP ${res.status}: ${body.slice(0, 200)}`,
        result: { status_code: res.status },
      };
    }

    let result: unknown = null;
    try {
      result = await res.json();
    } catch {
      result = { raw: await res.text().catch(() => "") };
    }

    return { status: "success", result };

  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    return { status: "failed", error: `Webhook request failed: ${msg}` };
  }
}