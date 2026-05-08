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
): Promise<{ sb: ReturnType<typeof getServiceClient> } | null> {
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
  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

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

export default router;
