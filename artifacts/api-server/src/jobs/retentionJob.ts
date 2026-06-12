import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

const MESSAGE_LIMIT = 500;
const RETENTION_DAYS = 30;

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── cleanOldDeletedConversations ────────────────────────────────────────────
// Hard-deletes conversations that were soft-deleted more than RETENTION_DAYS ago.
// Runs nightly at 2 AM.

export async function cleanOldDeletedConversations(): Promise<{ deleted: number }> {
  const sb = getServiceClient();
  if (!sb) {
    logger.warn("retentionJob: service client unavailable, skipping cleanOldDeletedConversations");
    return { deleted: 0 };
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Fetch IDs of conversations to delete (soft-deleted before cutoff)
  const { data, error: selectErr } = await sb
    .from("conversations")
    .select("id")
    .lt("deleted_at", cutoff) as { data: Array<{ id: string }> | null; error: unknown };

  if (selectErr || !data) {
    logger.error({ err: selectErr }, "retentionJob: failed to fetch old deleted conversations");
    return { deleted: 0 };
  }

  if (data.length === 0) {
    logger.info("retentionJob: no old deleted conversations to clean");
    return { deleted: 0 };
  }

  const ids = data.map((r) => r.id);
  const { error: delErr } = await sb
    .from("conversations")
    .delete()
    .in("id", ids) as { error: unknown };

  if (delErr) {
    logger.error({ err: delErr }, "retentionJob: failed to hard-delete conversations");
    return { deleted: 0 };
  }

  logger.info({ count: ids.length }, "retentionJob: cleaned old deleted conversations");
  return { deleted: ids.length };
}

// ─── enforceMessageLimit ─────────────────────────────────────────────────────
// Trims a conversation's messages to MESSAGE_LIMIT by deleting the oldest excess.
// Called after every new message is stored.

export async function enforceMessageLimit(conversationId: string): Promise<{ trimmed: number }> {
  if (!conversationId) return { trimmed: 0 };

  const sb = getServiceClient();
  if (!sb) {
    logger.warn("retentionJob: service client unavailable, skipping enforceMessageLimit");
    return { trimmed: 0 };
  }

  // Count messages in this conversation
  const { count, error: countErr } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId) as { count: number | null; error: unknown };

  if (countErr) {
    logger.error({ err: countErr, conversationId }, "retentionJob: failed to count messages");
    return { trimmed: 0 };
  }

  const total = count ?? 0;
  if (total <= MESSAGE_LIMIT) return { trimmed: 0 };

  const excess = total - MESSAGE_LIMIT;

  // Fetch oldest excess message IDs
  const { data: oldest, error: fetchErr } = await sb
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(excess) as { data: Array<{ id: string }> | null; error: unknown };

  if (fetchErr || !oldest || oldest.length === 0) {
    logger.error({ err: fetchErr, conversationId }, "retentionJob: failed to fetch oldest messages");
    return { trimmed: 0 };
  }

  const ids = oldest.map((m) => m.id);
  const { error: delErr } = await sb
    .from("messages")
    .delete()
    .in("id", ids) as { error: unknown };

  if (delErr) {
    logger.error({ err: delErr, conversationId }, "retentionJob: failed to trim messages");
    return { trimmed: 0 };
  }

  logger.info({ conversationId, trimmed: ids.length }, "retentionJob: trimmed messages");
  return { trimmed: ids.length };
}
