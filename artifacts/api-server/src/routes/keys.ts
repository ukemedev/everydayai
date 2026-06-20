import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt, isEncrypted } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

router.post("/keys/save", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
  if (!provider?.trim()) { res.status(400).json({ error: "provider is required" }); return; }
  if (!apiKey?.trim())   { res.status(400).json({ error: "apiKey is required" }); return; }

  try {
    const encrypted = encrypt(apiKey.trim());
    if (!encrypted || !isEncrypted(encrypted)) {
      logger.error({ provider, userId: user.id }, "Encryption failed – key not stored");
      res.status(500).json({ error: "Encryption failed" });
      return;
    }

    const sb = getServiceClient();
    const { error } = await sb.from("api_keys").upsert(
      { user_id: user.id, provider: provider.trim(), api_key: encrypted },
      { onConflict: "user_id,provider" }
    );
    if (error) {
      req.log.error({ error }, "Failed to save API key");
      res.status(500).json({ error: "Failed to save API key" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Encryption or DB error in keys/save");
    res.status(500).json({ error: "Failed to save API key" });
  }
});

router.delete("/keys/delete", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  const { provider } = req.body as { provider?: string };
  if (!provider?.trim()) { res.status(400).json({ error: "provider is required" }); return; }

  try {
    const sb = getServiceClient();
    const { error } = await sb
      .from("api_keys")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider.trim());
    if (error) {
      req.log.error({ error }, "Failed to delete API key");
      res.status(500).json({ error: "Failed to delete API key" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DB error in keys/delete");
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

router.get("/keys/list", async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("api_keys")
      .select("provider, api_key")
      .eq("user_id", user.id);
    if (error) {
      req.log.error({ error }, "Failed to list API keys");
      res.status(500).json({ error: "Failed to fetch keys" });
      return;
    }

    const keys = (data ?? []).map((row) => {
      const raw = row.api_key as string;
      let decrypted = "";
      try {
        decrypted = isEncrypted(raw) ? decrypt(raw) : raw;
      } catch {
        decrypted = raw;
      }
      const last4  = decrypted.length > 4 ? decrypted.slice(-4) : decrypted;
      const masked = "••••••••••••" + last4;
      return { provider: row.provider as string, masked };
    });

    res.json({ keys });
  } catch (err) {
    req.log.error({ err }, "Error in keys/list");
    res.status(500).json({ error: "Failed to fetch keys" });
  }
});

export async function migrateUnencryptedKeys(): Promise<void> {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const sb = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await sb.from("api_keys").select("id, api_key");
    if (error || !data) return;

    const toMigrate = data.filter((row) => !isEncrypted(row.api_key as string));
    if (toMigrate.length === 0) {
      logger.info("No unencrypted API keys found — migration skipped");
      return;
    }

    logger.info({ count: toMigrate.length }, "Migrating unencrypted API keys");

    for (const row of toMigrate) {
      try {
        const encrypted = encrypt(row.api_key as string);
        await sb.from("api_keys").update({ api_key: encrypted }).eq("id", row.id);
      } catch (err) {
        logger.error({ err, id: row.id }, "Failed to migrate API key");
      }
    }

    logger.info({ count: toMigrate.length }, "API key migration complete");
  } catch (err) {
    logger.error({ err }, "migrateUnencryptedKeys threw unexpectedly");
  }
}

export default router;
