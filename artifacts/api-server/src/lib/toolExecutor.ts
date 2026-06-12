// ─── toolExecutor.ts ─────────────────────────────────────────────
// Executes a single tool given its configuration and the conversation context.
//
// DISPATCH TABLE:
// → custom_webhook — real HTTP POST to user-configured URL
// → all others     — not yet implemented (returns structured failed result)
//                    This logs to tool_executions with a clear error message.
//                    Connector implementations are added incrementally.
//
// GUARANTEES:
// → Never throws — always returns ExecutionResult
// → custom_webhook timeout: 10 seconds
// → Payload is sanitised (message/reply capped at 2000 chars each)
// → Webhook URL is validated before fetch
// ─────────────────────────────────────────────────────────────────

export interface AgentToolInput {
  id:           string;
  connector_id: string;
  credentials:  Record<string, unknown>;
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

/**
 * Execute a single tool call and return a structured result.
 * This function never throws — callers can rely on the returned status.
 */
export async function executeTool(
  tool:  AgentToolInput,
  ctx:   ExecutionContext,
): Promise<ExecutionResult> {
  switch (tool.connector_id) {
    case "custom_webhook":
      return executeCustomWebhook(tool, ctx);
    default:
      return {
        status: "failed",
        error:  `Connector '${tool.connector_id}' is not yet implemented.`,
      };
  }
}

// ── custom_webhook ────────────────────────────────────────────────

async function executeCustomWebhook(
  tool: AgentToolInput,
  ctx:  ExecutionContext,
): Promise<ExecutionResult> {
  const webhookUrl = (tool.credentials.webhook_url as string | undefined)?.trim();

  if (!webhookUrl) {
    return { status: "failed", error: "custom_webhook: webhook_url is not configured." };
  }

  if (!webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
    return { status: "failed", error: "custom_webhook: webhook_url must start with http:// or https://" };
  }

  const payload = {
    agent_id:         ctx.agentId,
    conversation_id:  ctx.conversationId,
    customer_message: ctx.customerMessage.slice(0, 2000),
    ai_reply:         ctx.aiReply.slice(0, 2000),
    timestamp:        new Date().toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
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
