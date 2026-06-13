import { createClient } from "@supabase/supabase-js";

/**
 * Single source of truth for the Supabase service-role client.
 *
 * Reads VITE_SUPABASE_URL first (our canonical env name), then falls back to
 * SUPABASE_URL so the function works regardless of how the host env is
 * configured — Replit only sets VITE_SUPABASE_URL, so any route that called
 * process.env.SUPABASE_URL alone got null and silently dropped requests.
 *
 * Returns null when env vars are missing — every caller must guard against it.
 */
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;
