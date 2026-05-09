import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "../lib/planLimits.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── GET /api/billing ──────────────────────────────────────────────────────────

router.get("/billing", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  // Fetch profile
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("plan, message_count")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    req.log.error({ err: profileErr, userId }, "billing: profile not found");
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const plan         = (profile.plan as string | null) ?? "free";
  const messageCount = (profile.message_count as number | null) ?? 0;
  const limits       = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // Infinity serialises to null in JSON — frontend treats null as "Unlimited"
  const messageLimit = limits.messagesPerMonth === Infinity ? null : limits.messagesPerMonth;
  const agentLimit   = limits.agents === Infinity ? null : limits.agents;

  // Count the user's agents
  const { count: agentCount, error: agentErr } = await sb
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (agentErr) {
    req.log.error({ err: agentErr, userId }, "billing: failed to count agents");
  }

  // Last 10 payments, newest first
  const { data: payments, error: payErr } = await sb
    .from("payments")
    .select("id, plan, amount, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (payErr) {
    req.log.error({ err: payErr, userId }, "billing: failed to fetch payments");
  }

  req.log.info({ userId, plan }, "billing data fetched");

  res.json({
    currentPlan:  plan,
    messageCount,
    messageLimit,
    agentCount:   agentCount ?? 0,
    agentLimit,
    payments:     payments ?? [],
  });
});

export default router;
