import { Router } from "express";
import type { Request, Response } from "express";
import { getServiceClient } from "../lib/supabaseService.js";
import { PLAN_TOOL_LIMITS, getUserPlan } from "../lib/planLimits.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── GET /api/agents/:agentId/tools ──────────────────────────────────────────
// Returns all webhook tools for an agent owned by the authenticated user.

router.get("/agents/:agentId/tools", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // Verify agent ownership first
  const { data: agent } = await sb
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const { data, error } = await sb
    .from("agent_tools")
    .select("id, name, webhook_url, trigger_type, trigger_config, status, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });

  // Note: secret is intentionally excluded from the response.

  if (error) {
    logger.error({ err: error, agentId }, "failed to fetch agent tools");
    res.status(500).json({ error: "Failed to fetch tools" });
    return;
  }

  const plan      = await getUserPlan(userId);
  const toolLimit = PLAN_TOOL_LIMITS[plan] ?? PLAN_TOOL_LIMITS.free;

  res.json({ tools: data ?? [], limit: toolLimit, plan });
});

// ─── POST /api/agents/:agentId/tools ─────────────────────────────────────────
// Add a new webhook tool. Enforces per-plan tool limit.

router.post("/agents/:agentId/tools", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId } = req.params as { agentId: string };
  const { name, webhook_url, secret, trigger_type = "always", trigger_config = {} } =
    req.body as {
      name?:           string;
      webhook_url?:    string;
      secret?:         string;
      trigger_type?:   string;
      trigger_config?: { keywords?: string[]; fields?: string[] };
    };

  // ── Input validation ──────────────────────────────────────────────
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!webhook_url?.trim()) {
    res.status(400).json({ error: "webhook_url is required" });
    return;
  }
  if (!webhook_url.trim().startsWith("http://") && !webhook_url.trim().startsWith("https://")) {
    res.status(400).json({ error: "webhook_url must start with http:// or https://" });
    return;
  }
  if (!["always", "keyword", "data_collected"].includes(trigger_type)) {
    res.status(400).json({ error: "trigger_type must be always, keyword, or data_collected" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // ── Verify agent ownership ────────────────────────────────────────
  const { data: agent } = await sb
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  // ── Enforce plan tool limit ───────────────────────────────────────
  const plan      = await getUserPlan(userId);
  const toolLimit = PLAN_TOOL_LIMITS[plan] ?? PLAN_TOOL_LIMITS.free;

  const { count, error: countError } = await sb
    .from("agent_tools")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("status", "active");

  if (countError) {
    logger.error({ err: countError, agentId }, "failed to count agent tools");
    res.status(500).json({ error: "Failed to check tool limit" });
    return;
  }

  if ((count ?? 0) >= toolLimit) {
    res.status(403).json({
      error: `Your ${plan} plan allows a maximum of ${toolLimit} webhook tool${toolLimit === 1 ? "" : "s"} per agent. Upgrade to add more.`,
      limit: toolLimit,
      current: count ?? 0,
    });
    return;
  }

  // ── Insert ────────────────────────────────────────────────────────
  const { data, error } = await sb
    .from("agent_tools")
    .insert({
      agent_id:       agentId,
      user_id:        userId,
      name:           name.trim().slice(0, 100),
      webhook_url:    webhook_url.trim(),
      secret:         secret?.trim() || null,
      trigger_type,
      trigger_config,
      status:         "active",
    })
    .select("id, name, webhook_url, trigger_type, trigger_config, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "An tool with that name already exists on this agent" });
      return;
    }
    logger.error({ err: error, agentId }, "failed to insert agent tool");
    res.status(500).json({ error: "Failed to create tool" });
    return;
  }

  logger.info({ agentId, userId, toolId: (data as { id: string }).id }, "agent tool created");
  res.status(201).json({ tool: data });
});

// ─── PATCH /api/agents/:agentId/tools/:toolId ────────────────────────────────
// Update an existing webhook tool.

router.patch("/agents/:agentId/tools/:toolId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId, toolId } = req.params as { agentId: string; toolId: string };
  const { name, webhook_url, secret, trigger_type, trigger_config, status } =
    req.body as {
      name?:           string;
      webhook_url?:    string;
      secret?:         string | null;
      trigger_type?:   string;
      trigger_config?: { keywords?: string[]; fields?: string[] };
      status?:         string;
    };

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // Verify ownership via agent
  const { data: agent } = await sb
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined)           updates.name           = name.trim().slice(0, 100);
  if (webhook_url !== undefined) {
    if (!webhook_url.trim().startsWith("http://") && !webhook_url.trim().startsWith("https://")) {
      res.status(400).json({ error: "webhook_url must start with http:// or https://" });
      return;
    }
    updates.webhook_url = webhook_url.trim();
  }
  if (secret !== undefined)         updates.secret         = secret?.trim() || null;
  if (trigger_type !== undefined) {
    if (!["always", "keyword", "data_collected"].includes(trigger_type)) {
      res.status(400).json({ error: "trigger_type must be always, keyword, or data_collected" });
      return;
    }
    updates.trigger_type = trigger_type;
  }
  if (trigger_config !== undefined) updates.trigger_config = trigger_config;
  if (status !== undefined) {
    if (!["active", "inactive"].includes(status)) {
      res.status(400).json({ error: "status must be active or inactive" });
      return;
    }
    updates.status = status;
  }

  const { data, error } = await sb
    .from("agent_tools")
    .update(updates)
    .eq("id", toolId)
    .eq("agent_id", agentId)
    .select("id, name, webhook_url, trigger_type, trigger_config, status, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  logger.info({ agentId, userId, toolId }, "agent tool updated");
  res.json({ tool: data });
});

// ─── DELETE /api/agents/:agentId/tools/:toolId ───────────────────────────────

router.delete("/agents/:agentId/tools/:toolId", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentId, toolId } = req.params as { agentId: string; toolId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: agent } = await sb
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const { error } = await sb
    .from("agent_tools")
    .delete()
    .eq("id", toolId)
    .eq("agent_id", agentId);

  if (error) {
    logger.error({ err: error, agentId, toolId }, "failed to delete agent tool");
    res.status(500).json({ error: "Failed to delete tool" });
    return;
  }

  logger.info({ agentId, userId, toolId }, "agent tool deleted");
  res.json({ ok: true });
});

export default router;