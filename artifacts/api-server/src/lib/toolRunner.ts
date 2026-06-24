// ─── toolRunner.ts ───────────────────────────────────────────────
// Orchestrates the full tool execution pipeline for a single conversation turn.
//
// PIPELINE:
//   1. Fetch all active agent_tools for this agent
//   2. For each tool: evaluate trigger condition
//   3. If trigger fires: execute the webhook
//   4. Write result to tool_executions audit log
//
// USAGE (fire-and-forget from agentProcessor):
//   void runAgentTools(agentId, conversationId, customerMsg, aiReply, sb)
//     .catch(err => logger.error({ err }, "runAgentTools failed"));
//
// GUARANTEES:
// → Never blocks the HTTP response
// → Per-tool errors are caught — one failure never stops others
// → tool_executions insert failure is suppressed (non-fatal audit)
// → Never throws
// ─────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateTrigger } from "./triggerEvaluator.js";
import { executeTool } from "./toolExecutor.js";
import { logger } from "./logger.js";

interface AgentToolRow {
  id:             string;
  agent_id:       string;
  name:           string;
  webhook_url:    string;
  secret:         string | null;
  trigger_type:   string;
  trigger_config: { keywords?: string[]; fields?: string[] };
  status:         string;
}

export async function runAgentTools(
  agentId:         string,
  conversationId:  string,
  customerMessage: string,
  aiReply:         string,
  sb:              SupabaseClient,
): Promise<void> {
  const { data: rows, error } = await sb
    .from("agent_tools")
    .select("id, agent_id, name, webhook_url, secret, trigger_type, trigger_config, status")
    .eq("agent_id", agentId)
    .eq("status", "active");

  if (error) {
    logger.warn({ err: error, agentId }, "runAgentTools: failed to fetch agent_tools");
    return;
  }

  if (!rows || rows.length === 0) return;

  for (const tool of rows as AgentToolRow[]) {
    const triggerFired = evaluateTrigger(
      tool.trigger_type as "always" | "keyword" | "data_collected",
      tool.trigger_config ?? {},
      customerMessage,
      aiReply,
    );

    if (!triggerFired) continue;

    try {
      const result = await executeTool(
        {
          id:          tool.id,
          name:        tool.name,
          webhook_url: tool.webhook_url,
          secret:      tool.secret,
        },
        { agentId, conversationId, customerMessage, aiReply },
      );

      const { error: auditError } = await sb
        .from("tool_executions")
        .insert({
          agent_tool_id:   tool.id,
          agent_id:        agentId,
          conversation_id: conversationId,
          trigger_type:    tool.trigger_type,
          status:          result.status,
          error_message:   result.error ?? null,
          result:          result.result ?? null,
          payload: {
            customer_message: customerMessage.slice(0, 500),
            ai_reply:         aiReply.slice(0, 500),
          },
        });

      if (auditError) {
        logger.warn({ err: auditError, agentId, toolId: tool.id }, "runAgentTools: audit insert failed (non-fatal)");
      }

      logger.info(
        { agentId, toolId: tool.id, toolName: tool.name, status: result.status },
        "runAgentTools: tool executed",
      );

    } catch (execErr) {
      logger.error(
        { err: execErr, agentId, toolId: tool.id, toolName: tool.name },
        "runAgentTools: unexpected execution error",
      );

      try {
        await sb.from("tool_executions").insert({
          agent_tool_id:   tool.id,
          agent_id:        agentId,
          conversation_id: conversationId,
          trigger_type:    tool.trigger_type,
          status:          "failed",
          error_message:   execErr instanceof Error ? execErr.message : "Unexpected error",
          payload: {
            customer_message: customerMessage.slice(0, 500),
            ai_reply:         aiReply.slice(0, 500),
          },
        });
      } catch (_) { /* non-fatal */ }
    }
  }
}