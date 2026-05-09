import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditParams {
  user_id:     string | null | undefined;
  action:      string;
  resource?:   string;
  resource_id?: string;
  metadata?:   Record<string, unknown>;
  req?:        Request;
}

// ── Service client ────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── logAudit ──────────────────────────────────────────────────────────────────
//
// Fire-and-forget audit log writer. Never throws — a logging failure must never
// break the calling request. Attach `req` to capture IP and User-Agent.

export async function logAudit(params: AuditParams): Promise<void> {
  const sb = getServiceClient();
  if (!sb) return;

  const { user_id, action, resource, resource_id, metadata, req } = params;

  const ip_address = req
    ? ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "")
    : "";

  const user_agent = req ? (req.headers["user-agent"] ?? "") : "";

  try {
    const { error } = await sb.from("audit_logs").insert({
      user_id:     user_id ?? null,
      action,
      resource:    resource ?? null,
      resource_id: resource_id ?? null,
      metadata:    metadata ?? null,
      ip_address:  ip_address || null,
      user_agent:  user_agent || null,
    });

    if (error) {
      logger.warn({ err: error, action, user_id }, "audit log insert failed");
    }
  } catch (err) {
    logger.warn({ err, action, user_id }, "audit log threw unexpectedly");
  }
}
