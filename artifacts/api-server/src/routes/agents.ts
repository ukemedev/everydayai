import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserPlan, PLAN_LIMITS } from "../lib/planLimits.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── POST /api/agents ─────────────────────────────────────────────────────────

router.post("/agents", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();
  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  // Verify user
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = user.id;

  // Get plan and limits
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // Count existing agents
  const { count, error: countErr } = await sb
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countErr) {
    req.log.error({ err: countErr }, "failed to count agents");
    res.status(500).json({ error: "Failed to check agent limit" });
    return;
  }

  const currentCount = count ?? 0;
  const agentLimit = limits.agents;

  if (agentLimit !== Infinity && currentCount >= agentLimit) {
    res.status(403).json({ error: "AGENT_LIMIT_REACHED", limit: agentLimit, plan });
    return;
  }

  // Create agent
  const { name, description, model } = req.body as {
    name: string;
    description?: string;
    model?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const { data, error: insertErr } = await sb
    .from("agents")
    .insert({
      name:        name.trim(),
      description: description?.trim() || null,
      model:       model ?? "gpt-4o-mini",
      user_id:     userId,
    })
    .select()
    .single();

  if (insertErr) {
    req.log.error({ err: insertErr }, "failed to create agent");
    res.status(500).json({ error: "Failed to create agent" });
    return;
  }

  req.log.info({ agentId: data.id, userId, plan }, "agent created");
  res.status(201).json({ agent: data });
});

export default router;
