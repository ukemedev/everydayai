import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface RollbackRow {
  id: string;
  session_id: string;
  file_path: string;
  old_content: string;
  commit_message: string | null;
  created_at: string;
}

export async function saveSnapshot(
  sessionId: string,
  filePath: string,
  oldContent: string,
  commitMessage?: string,
): Promise<void> {
  try {
    const sb = getServiceClient();
    const { error } = await sb.from("devbot_rollbacks").insert({
      session_id: sessionId,
      file_path: filePath,
      old_content: oldContent,
      commit_message: commitMessage ?? null,
    });
    if (error) logger.warn({ err: error }, "devbotRollback: saveSnapshot failed");
  } catch (err) {
    logger.warn({ err }, "devbotRollback: saveSnapshot threw");
  }
}

export async function getSnapshots(filePath: string): Promise<RollbackRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("devbot_rollbacks")
    .select("id, session_id, file_path, old_content, commit_message, created_at")
    .eq("file_path", filePath)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as RollbackRow[];
}

export async function getSnapshotById(id: string): Promise<RollbackRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("devbot_rollbacks")
    .select("id, session_id, file_path, old_content, commit_message, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as RollbackRow | null;
}

export async function getAllSnapshots(): Promise<RollbackRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("devbot_rollbacks")
    .select("id, session_id, file_path, old_content, commit_message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as RollbackRow[];
}
