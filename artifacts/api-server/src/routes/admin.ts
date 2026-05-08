import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

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
): Promise<{ sb: NonNullable<ReturnType<typeof getServiceClient>> } | null> {
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

  return { sb };
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

  const [usersRes, agentsRes, automationsRes, messagesRes] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("agents").select("*", { count: "exact", head: true }),
    sb.from("automations").select("*", { count: "exact", head: true }),
    Promise.resolve(
      sb.from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startOfMonth)
    ).catch(() => ({ count: 0, error: null })),
  ]);

  const stats = {
    totalUsers:        usersRes.count       ?? 0,
    totalAgents:       agentsRes.count      ?? 0,
    totalAutomations:  automationsRes.count ?? 0,
    messagesThisMonth: messagesRes.count    ?? 0,
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

  const { sb } = result;
  const { id } = req.params as { id: string };

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
  res.json({ suspended: newSuspended });
});

export default router;
