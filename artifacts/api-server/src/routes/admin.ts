import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logAudit } from "../lib/auditLog.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(
  req: Request,
  res: Response
): Promise<{ sb: NonNullable<ReturnType<typeof getServiceClient>>; adminUserId: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();

  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return null;
  }

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.is_admin !== true) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return { sb, adminUserId: user.id };
}

// ─── GET /api/admin/verify ────────────────────────────────────────────────────

router.get("/admin/verify", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  req.log.info("admin verified");
  res.json({ isAdmin: true });
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

router.get("/admin/stats", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;

  const { sb } = result;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [usersRes, agentsRes, messagesRes] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("agents").select("*", { count: "exact", head: true }),
    Promise.resolve(
      sb.from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfMonth)
    ).catch(() => ({ count: 0, error: null })),
  ]);

  const stats = {
    totalUsers:        usersRes.count    ?? 0,
    totalAgents:       agentsRes.count   ?? 0,
    messagesThisMonth: messagesRes.count ?? 0,
  };

  req.log.info(stats, "admin stats fetched");
  res.json(stats);
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

router.get("/admin/users", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;

  const { sb } = result;

  // Fetch all auth users (up to 1000), all profiles, and all agents in parallel
  const [authRes, profilesRes, agentsRes] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from("profiles").select("id, is_admin, suspended, created_at, plan"),
    sb.from("agents").select("user_id"),
  ]);

  const authUsers = authRes.data?.users ?? [];

  // Build profile lookup map
  type ProfileRow = {
    id: string;
    is_admin: boolean | null;
    suspended: boolean | null;
    created_at: string | null;
    plan: string | null;
  };
  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    profileMap.set(p.id, p);
  }

  // Build agent count lookup map
  const agentCountMap = new Map<string, number>();
  for (const a of (agentsRes.data ?? []) as { user_id: string }[]) {
    agentCountMap.set(a.user_id, (agentCountMap.get(a.user_id) ?? 0) + 1);
  }

  const users = authUsers.map((u) => {
    const p = profileMap.get(u.id);
    return {
      id:          u.id,
      email:       u.email ?? "",
      created_at:  u.created_at,
      plan:        p?.plan ?? "free",
      agent_count: agentCountMap.get(u.id) ?? 0,
      is_admin:    p?.is_admin ?? false,
      suspended:   p?.suspended ?? false,
    };
  });

  req.log.info({ count: users.length }, "admin users fetched");
  res.json({ users });
});

// ─── PATCH /api/admin/users/:id/suspend ──────────────────────────────────────

router.patch("/admin/users/:id/suspend", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;

  const { sb, adminUserId } = result;
  const { id } = req.params as { id: string };

  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Invalid user ID format" });
    return;
  }

  // Get current state
  const { data: profile, error: fetchErr } = await sb
    .from("profiles")
    .select("suspended")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    req.log.error({ err: fetchErr, userId: id }, "failed to fetch profile for suspend toggle");
    res.status(500).json({ error: "Failed to fetch user" });
    return;
  }

  const newSuspended = !(profile?.suspended ?? false);

  const { error: updateErr } = await sb
    .from("profiles")
    .update({ suspended: newSuspended })
    .eq("id", id);

  if (updateErr) {
    req.log.error({ err: updateErr, userId: id }, "failed to update suspended state");
    res.status(500).json({ error: "Failed to update user" });
    return;
  }

  req.log.info({ userId: id, suspended: newSuspended }, "user suspend toggled");

  void logAudit({
    user_id:     adminUserId,
    action:      newSuspended ? "user_suspended" : "user_unsuspended",
    resource:    "user",
    resource_id: id,
    req,
  });

  res.json({ suspended: newSuspended });
});

// ─── GET /api/admin/agents ────────────────────────────────────────────────────

router.get("/admin/agents", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;

  const { sb } = result;

  // Fetch all agents and all auth users in parallel
  const [agentsRes, authRes] = await Promise.all([
    sb.from("agents").select("id, name, description, model, status, user_id, created_at").order("created_at", { ascending: false }),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (agentsRes.error) {
    req.log.error({ err: agentsRes.error }, "failed to fetch agents");
    res.status(500).json({ error: "Failed to fetch agents" });
    return;
  }

  // Build email lookup map
  const emailMap = new Map<string, string>();
  for (const u of authRes.data?.users ?? []) {
    emailMap.set(u.id, u.email ?? "");
  }

  type AgentRow = {
    id: string;
    name: string;
    description: string | null;
    model: string | null;
    status: string | null;
    user_id: string;
    created_at: string;
  };

  const agents = (agentsRes.data as AgentRow[]).map((a) => ({
    id:          a.id,
    name:        a.name,
    description: a.description ?? "",
    model:       a.model ?? "",
    status:      a.status ?? "draft",
    owner_email: emailMap.get(a.user_id) ?? "",
    created_at:  a.created_at,
  }));

  req.log.info({ count: agents.length }, "admin agents fetched");
  res.json({ agents });
});

// ─── GET /api/admin/revenue ───────────────────────────────────────────────────

router.get("/admin/revenue", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;

  const { sb } = result;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [profilesRes, paymentsRes, recentRes, authRes] = await Promise.all([
    sb.from("profiles").select("plan"),
    // All successful payments (amount + created_at for totals)
    sb.from("payments").select("amount, created_at").eq("status", "success"),
    // Last 5 successful payments for the table
    sb.from("payments")
      .select("id, user_id, plan, amount, created_at")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(5),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profilesRes.error) {
    req.log.error({ err: profilesRes.error }, "failed to fetch profiles for revenue");
    res.status(500).json({ error: "Failed to fetch revenue data" });
    return;
  }

  // ── Plan counts ────────────────────────────────────────────────────────────
  type ProfileRow = { plan: string | null };
  const rows = (profilesRes.data as ProfileRow[]) ?? [];

  const freeUsers     = rows.filter((r) => !r.plan || r.plan === "free").length;
  const starterUsers  = rows.filter((r) => r.plan === "starter").length;
  const proUsers      = rows.filter((r) => r.plan === "pro").length;
  const businessUsers = rows.filter((r) => r.plan === "business").length;

  // MRR estimate in Naira based on current subscriptions
  const monthlyRevenue = starterUsers * 8000 + proUsers * 24000 + businessUsers * 56000;

  // ── Actual payment totals ──────────────────────────────────────────────────
  type PaymentRow = { amount: number; created_at: string };
  const allPayments = (paymentsRes.data as PaymentRow[]) ?? [];

  // Amounts stored in kobo — convert to naira
  const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0) / 100;
  const revenueThisMonth = allPayments
    .filter((p) => p.created_at >= startOfMonth)
    .reduce((sum, p) => sum + p.amount, 0) / 100;
  const totalTransactions = allPayments.length;

  // ── Recent payments with email lookup ─────────────────────────────────────
  type RecentRow = { id: string; user_id: string; plan: string; amount: number; created_at: string };
  const recentRows = (recentRes.data as RecentRow[]) ?? [];

  const emailMap = new Map<string, string>();
  for (const u of authRes.data?.users ?? []) {
    emailMap.set(u.id, u.email ?? "");
  }

  const recentPayments = recentRows.map((p) => ({
    id:         p.id,
    email:      emailMap.get(p.user_id) ?? "unknown",
    plan:       p.plan,
    amount:     p.amount / 100,   // naira
    created_at: p.created_at,
  }));

  req.log.info(
    { freeUsers, starterUsers, proUsers, businessUsers, totalRevenue, totalTransactions },
    "admin revenue fetched",
  );

  res.json({
    freeUsers,
    starterUsers,
    proUsers,
    businessUsers,
    monthlyRevenue,
    totalRevenue,
    revenueThisMonth,
    totalTransactions,
    recentPayments,
  });
});

// ─── PATCH /api/admin/users/:id/plan ─────────────────────────────────────────

router.patch("/admin/users/:id/plan", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb, adminUserId } = result;
  const { id } = req.params as { id: string };

  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Invalid user ID format" });
    return;
  }

  const VALID_PLANS = ["free", "starter", "pro", "business"] as const;
  const { plan } = req.body as { plan: string };

  if (!plan || !VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) {
    res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
    return;
  }

  // Fetch current plan before update (for audit metadata)
  const { data: currentProfile } = await sb
    .from("profiles")
    .select("plan")
    .eq("id", id)
    .maybeSingle();

  const oldPlan = (currentProfile as { plan?: string } | null)?.plan ?? "free";

  const { error } = await sb
    .from("profiles")
    .update({ plan })
    .eq("id", id);

  if (error) {
    req.log.error({ err: error, userId: id, plan }, "failed to update user plan");
    res.status(500).json({ error: "Failed to update plan" });
    return;
  }

  req.log.info({ userId: id, plan }, "user plan updated");

  void logAudit({
    user_id:     adminUserId,
    action:      "plan_changed",
    resource:    "user",
    resource_id: id,
    metadata:    { oldPlan, newPlan: plan },
    req,
  });

  res.json({ plan });
});

// ─── GET /api/admin/settings ─────────────────────────────────────────────────

router.get("/admin/settings", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;

  const { data, error } = await sb
    .from("platform_settings")
    .select("pricing_enabled")
    .eq("id", 1)
    .single();

  if (error) {
    req.log.error({ err: error }, "failed to fetch platform settings");
    res.status(500).json({ error: "Failed to fetch settings" });
    return;
  }

  req.log.info({ pricingEnabled: data.pricing_enabled }, "platform settings fetched");
  res.json({ pricingEnabled: data.pricing_enabled ?? false });
});

// ─── PATCH /api/admin/settings ────────────────────────────────────────────────

router.patch("/admin/settings", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;

  const { pricingEnabled } = req.body as { pricingEnabled: boolean };
  if (typeof pricingEnabled !== "boolean") {
    res.status(400).json({ error: "pricingEnabled must be a boolean" });
    return;
  }

  const { data, error } = await sb
    .from("platform_settings")
    .update({ pricing_enabled: pricingEnabled, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("pricing_enabled")
    .single();

  if (error) {
    req.log.error({ err: error }, "failed to update platform settings");
    res.status(500).json({ error: "Failed to update settings" });
    return;
  }

  req.log.info({ pricingEnabled: data.pricing_enabled }, "platform settings updated");
  res.json({ pricingEnabled: data.pricing_enabled });
});

// ─── GET /api/admin/audit ─────────────────────────────────────────────────────

router.get("/admin/audit", async (req: Request, res: Response) => {
  const result = await requireAdmin(req, res);
  if (!result) return;
  const { sb } = result;

  const { data: logs, error } = await sb
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    req.log.error({ err: error }, "failed to fetch audit logs");
    res.status(500).json({ error: "Failed to fetch audit logs" });
    return;
  }

  // Build email map from auth users for all distinct user_ids in these logs
  type AuditRow = {
    id: string;
    user_id: string | null;
    action: string;
    resource: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  };

  const auditRows = (logs ?? []) as AuditRow[];
  const distinctUserIds = [...new Set(auditRows.map((l) => l.user_id).filter(Boolean))] as string[];

  const emailMap = new Map<string, string>();
  if (distinctUserIds.length > 0) {
    const { data: authRes } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authRes?.users ?? []) {
      emailMap.set(u.id, u.email ?? "");
    }
  }

  const enrichedLogs = auditRows.map((l) => ({
    id:          l.id,
    user_id:     l.user_id,
    user_email:  l.user_id ? (emailMap.get(l.user_id) ?? "unknown") : "system",
    action:      l.action,
    resource:    l.resource,
    resource_id: l.resource_id,
    metadata:    l.metadata,
    ip_address:  l.ip_address,
    created_at:  l.created_at,
  }));

  req.log.info({ count: enrichedLogs.length }, "admin audit logs fetched");
  res.json({ logs: enrichedLogs });
});

export default router;
