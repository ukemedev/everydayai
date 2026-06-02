import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserPlan, PLAN_LIMITS } from "../lib/planLimits.js";
import { sanitizeText } from "../lib/sanitize.js";
import { logger } from "../lib/logger.js";

const router = Router();

const PLAN_ORDER = ["free", "starter", "pro", "business"] as const;
type Plan = typeof PLAN_ORDER[number];

function planIndex(p: string): number {
  return PLAN_ORDER.indexOf((p ?? "free").toLowerCase() as Plan);
}

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── GET /api/templates ───────────────────────────────────────────────────────
// Public list of published templates. Requires auth to determine user plan.

router.get("/templates", async (req: Request, res: Response) => {
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const authHeader = req.headers.authorization;
  let userPlan: string = "free";

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user } } = await sb.auth.getUser(token);
    if (user?.id) {
      userPlan = await getUserPlan(user.id);
    }
  }

  const { data, error } = await sb
    .from("templates")
    .select("id, name, slug, category, description, tools_json, plan_required, featured, icon")
    .eq("published", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    logger.error({ err: error }, "failed to fetch templates");
    res.status(500).json({ error: "Failed to fetch templates" });
    return;
  }

  const templates = (data ?? []).map((t) => ({
    ...t,
    locked: planIndex(t.plan_required as string) > planIndex(userPlan),
  }));

  res.json({ templates, userPlan });
});

// ─── POST /api/templates/:id/use ─────────────────────────────────────────────
// Creates a new agent from a template. Requires auth.

router.post("/templates/:id/use", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = user.id;
  const userPlan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[userPlan] ?? PLAN_LIMITS.free;

  // Fetch template
  const { data: template, error: tplErr } = await sb
    .from("templates")
    .select("*")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();

  if (tplErr || !template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Check plan gate
  if (planIndex((template.plan_required as string) ?? "free") > planIndex(userPlan)) {
    res.status(403).json({ error: "Upgrade your plan to use this template" });
    return;
  }

  // Check agent limit
  const { count, error: countErr } = await sb
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countErr) {
    res.status(500).json({ error: "Failed to check agent count" });
    return;
  }

  if ((count ?? 0) >= limits.agents) {
    res.status(403).json({ error: "AGENT_LIMIT_REACHED", limit: limits.agents, plan: userPlan });
    return;
  }

  // Create agent from template
  const agentName = sanitizeText((template.name as string) ?? "My Agent");

  const { data: agent, error: insertErr } = await sb
    .from("agents")
    .insert({
      user_id:      userId,
      name:         agentName,
      description:  template.description ?? null,
      instructions: template.instructions ?? "",
      model:        "gpt-4o-mini",
      status:       "active",
    })
    .select("id, name")
    .single();

  if (insertErr || !agent) {
    logger.error({ err: insertErr, userId, templateId: id }, "failed to create agent from template");
    res.status(500).json({ error: "Failed to create agent" });
    return;
  }

  logger.info({ userId, templateId: id, agentId: agent.id }, "agent created from template");
  res.json({ agentId: agent.id, agentName: agent.name });
});

export default router;
