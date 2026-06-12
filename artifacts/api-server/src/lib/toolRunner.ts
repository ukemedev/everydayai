// ─── toolRunner.ts ───────────────────────────────────────────────
// Orchestrates the full tool execution pipeline for a single conversation turn.
//
// PIPELINE:
//   1. Fetch all active agent_tools for this agent
//   2. For each tool: evaluate trigger condition
//   3. If trigger fires: execute the tool (async, non-blocking)
//   4. Write result to tool_executions audit log
//
// USAGE (in all 5 channels — fire-and-forget):
//   void runAgentTools(agentId, conversationId, customerMsg, aiReply, sb)
//     .catch(err => logger.error({ err }, "runAgentTools failed"));
//
// GUARANTEES:
// → Never blocks the HTTP response — always called as void
// → Per-tool errors are caught and logged — one failure never stops others
// → tool_executions insert failure is suppressed (non-fatal audit)
// → No throw — callers use void, so exceptions would be unhandled
// ─────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateTrigger } from "./triggerEvaluator.js";
import { executeTool } from "./toolExecutor.js";
import { logger } from "./logger.js";

interface AgentToolRow {
  id:             string;
  agent_id:       string;
  connector_id:   string;
  credentials:    Record<string, unknown>;
  trigger_type:   string;
  trigger_config: { keywords?: string[]; fields?: string[] };
  status:         string;
}

/**
 * Run all active tools for an agent after an AI reply.
 * Call as: void runAgentTools(...).catch(...)
 */
export async function runAgentTools(
  agentId:         string,
  conversationId:  string,
  customerMessage: string,
  aiReply:         string,
  sb:              SupabaseClient,
): Promise<void> {
  // 1. Fetch all active tools for this agent
  const { data: rows, error } = await sb
    .from("agent_tools")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "active");

  if (error) {
    logger.warn({ err: error, agentId }, "runAgentTools: failed to fetch agent_tools");
    return;
  }

  if (!rows || rows.length === 0) return;

  const agentTools = rows as AgentToolRow[];

  // 2. Evaluate + execute each tool
  for (const tool of agentTools) {
    const triggerFired = evaluateTrigger(
      tool.trigger_type as "always" | "keyword" | "data_collected",
      tool.trigger_config ?? {},
      customerMessage,
      aiReply,
    );

    if (!triggerFired) continue;

    // 3. Execute (errors caught per-tool — one failure never stops others)
    try {
      const result = await executeTool(
        {
          id:           tool.id,
          connector_id: tool.connector_id,
          credentials:  tool.credentials ?? {},
        },
        { agentId, conversationId, customerMessage, aiReply },
      );

      // 4. Write audit log
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
        logger.warn({ err: auditError, agentId, toolId: tool.id }, "runAgentTools: audit log insert failed (non-fatal)");
      }

      logger.info(
        { agentId, toolId: tool.id, connectorId: tool.connector_id, status: result.status },
        "runAgentTools: tool executed",
      );
    } catch (execErr) {
      logger.error(
        { err: execErr, agentId, toolId: tool.id, connectorId: tool.connector_id },
        "runAgentTools: unexpected execution error",
      );

      // Best-effort audit of the failure
      try {
        await sb
          .from("tool_executions")
          .insert({
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
