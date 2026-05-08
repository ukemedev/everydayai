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

router.get("/admin/verify", async (req: Request, res: Response) => {
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

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/users?select=is_admin&id=eq.${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Accept-Profile": "auth",
        },
      }
    );

    if (!resp.ok) {
      req.log.warn({ status: resp.status, userId: user.id }, "is_admin fetch failed");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rows = (await resp.json()) as Array<{ is_admin: boolean | null }>;
    const isAdmin = rows[0]?.is_admin === true;

    if (!isAdmin) {
      req.log.info({ userId: user.id }, "admin verify denied — not an admin");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.log.info({ userId: user.id }, "admin verified");
    res.json({ isAdmin: true });
  } catch (err) {
    req.log.error({ err }, "admin verify threw unexpectedly");
    res.status(401).json({ error: "Unauthorized" });
  }
});

export default router;
