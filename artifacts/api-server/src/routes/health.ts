import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.post("/devbot/capture-error", (req, res) => {
  const { pageUrl, errorMessage, errorStack, component, severity } = req.body as {
    pageUrl?: string;
    errorMessage?: string;
    errorStack?: string;
    component?: string;
    severity?: string;
  };
  req.log.error(
    { pageUrl, component, severity, errorStack },
    `[ClientError] ${errorMessage ?? "(no message)"}`,
  );
  res.status(200).json({ ok: true });
});

export default router;

// ── Encryption health check ──────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { isEncrypted } from "../lib/encryption.js";

router.get("/health/encryption", async (_req: Request, res: Response) => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("api_keys").select("id, provider, api_key");
  if (error) {
    res.status(500).json({ error: "Failed to fetch API keys" });
    return;
  }

  const plaintextKeys = (data ?? []).filter(
    (row) => !isEncrypted(row.api_key as string)
  );

  res.json({
    total: data?.length ?? 0,
    encrypted: (data?.length ?? 0) - plaintextKeys.length,
    plaintext: plaintextKeys.length,
    plaintextIds: plaintextKeys.map((r) => ({ id: r.id, provider: r.provider })),
  });
});
