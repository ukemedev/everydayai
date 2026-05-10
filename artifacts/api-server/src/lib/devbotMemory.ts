import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface MemoryRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface LessonRow {
  id: string;
  trigger: string;
  lesson: string;
  applied_count: number;
  created_at: string;
}

export async function saveMessage(
  sessionId: string,
  role: string,
  content: string,
): Promise<void> {
  try {
    const sb = getServiceClient();
    const { error } = await sb
      .from("devbot_memory")
      .insert({ session_id: sessionId, role, content });
    if (error) logger.warn({ err: error }, "devbotMemory: saveMessage failed");
  } catch (err) {
    logger.warn({ err }, "devbotMemory: saveMessage threw");
  }
}

export async function searchMemory(query: string): Promise<MemoryRow[]> {
  try {
    const sb = getServiceClient();
    const words = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10);

    if (words.length === 0) return [];

    let qb = sb
      .from("devbot_memory")
      .select("id, session_id, role, content, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    for (const word of words) {
      qb = qb.ilike("content", `%${word}%`);
    }

    const { data, error } = await qb;
    if (error) {
      logger.warn({ err: error }, "devbotMemory: searchMemory failed");
      return [];
    }
    return (data as MemoryRow[]) ?? [];
  } catch (err) {
    logger.warn({ err }, "devbotMemory: searchMemory threw");
    return [];
  }
}

export async function saveLesson(trigger: string, lesson: string): Promise<void> {
  try {
    const sb = getServiceClient();
    const { error } = await sb
      .from("devbot_lessons")
      .insert({ trigger, lesson });
    if (error) logger.warn({ err: error }, "devbotMemory: saveLesson failed");
  } catch (err) {
    logger.warn({ err }, "devbotMemory: saveLesson threw");
  }
}

export async function getLessons(): Promise<LessonRow[]> {
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("devbot_lessons")
      .select("id, trigger, lesson, applied_count, created_at")
      .order("applied_count", { ascending: false });
    if (error) {
      logger.warn({ err: error }, "devbotMemory: getLessons failed");
      return [];
    }
    return (data as LessonRow[]) ?? [];
  } catch (err) {
    logger.warn({ err }, "devbotMemory: getLessons threw");
    return [];
  }
}
