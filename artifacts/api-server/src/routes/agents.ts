import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserPlan, PLAN_LIMITS } from "../lib/planLimits.js";
import { logAudit } from "../lib/auditLog.js";
import { sanitizeText } from "../lib/sanitize.js";

const router = Router();

const VALID_MODELS = new Set([
  "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo",
  "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229",
  "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash",
  "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768",
]);

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

  const { name, description, model } = req.body as {
    name: string;
    description?: string;
    model?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  if (name.trim().length > 100) {
    res.status(400).json({ error: "name must be 100 characters or fewer" });
    return;
  }

  if (description && description.trim().length > 500) {
    res.status(400).json({ error: "description must be 500 characters or fewer" });
    return;
  }

  const resolvedModel = model ?? "gpt-4o-mini";
  if (!VALID_MODELS.has(resolvedModel)) {
    res.status(400).json({ error: "Unsupported model" });
    return;
  }

  const safeName = sanitizeText(name.trim());
  const safeDescription = description ? sanitizeText(description.trim()) : null;

  const { data, error: insertErr } = await sb
    .from("agents")
    .insert({
      name:        safeName,
      description: safeDescription || null,
      model:       resolvedModel,
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

  void logAudit({
    user_id:     userId,
    action:      "agent_created",
    resource:    "agent",
    resource_id: (data as { id: string }).id,
    req,
  });

  res.status(201).json({ agent: data });
});

export default router;
