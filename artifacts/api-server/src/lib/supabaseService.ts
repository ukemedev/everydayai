import { createClient } from "@supabase/supabase-js";
import ws from "ws";

/**
 * Single source of truth for the Supabase service-role client.
 *
 * Reads VITE_SUPABASE_URL first (our canonical env name), then falls back to
 * SUPABASE_URL so the function works regardless of how the host env is
 * configured — Replit only sets VITE_SUPABASE_URL, so any route that called
 * process.env.SUPABASE_URL alone got null and silently dropped requests.
 *
 * Returns null when env vars are missing — every caller must guard against it.
 *
 * NODE 20 FIX: supabase-js's RealtimeClient requires a native WebSocket
 * global, only available in Node 22+. On Node < 22 it throws synchronously
 * during createClient() unless a transport is explicitly provided. This was
 * crashing EVERY call to this function in production if running on Node 20 —
 * see https://github.com/orgs/supabase/discussions/37869. The `as any` cast
 * is required because @supabase/supabase-js's TypeScript defs don't yet
 * accept the `ws` package's WebSocket type as a valid WebSocketLike (a known,
 * still-open upstream typing gap, not a mistake here).
 */
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });
}

export type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;