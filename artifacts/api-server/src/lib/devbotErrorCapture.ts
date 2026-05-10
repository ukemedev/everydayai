import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ErrorCaptureData {
  userId?: string;
  userEmail?: string;
  pageUrl: string;
  errorMessage: string;
  errorStack?: string;
  component?: string;
  severity?: string;
}

export interface ErrorRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  page_url: string;
  error_message: string;
  error_stack: string | null;
  component: string | null;
  severity: string;
  resolved: boolean;
  created_at: string;
}

// ── Telegram alert ────────────────────────────────────────────────────────────

async function sendTelegramAlert(data: ErrorCaptureData): Promise<void> {
  const token  = process.env.DEVBOT_TELEGRAM_TOKEN;
  const chatId = process.env.DEVBOT_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text =
    `🚨 EverydayAI Error Alert\n` +
    `User: ${data.userEmail ?? "Anonymous"}\n` +
    `Page: ${data.pageUrl}\n` +
    `Error: ${data.errorMessage.slice(0, 300)}\n` +
    `Time: ${new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    logger.warn({ err }, "devbotErrorCapture: telegram alert failed");
  }
}

// ── captureError ──────────────────────────────────────────────────────────────

export async function captureError(data: ErrorCaptureData): Promise<string> {
  const sb = getServiceClient();

  const { data: row, error } = await sb
    .from("devbot_user_errors")
    .insert({
      user_id:       data.userId      ?? null,
      user_email:    data.userEmail   ?? null,
      page_url:      data.pageUrl,
      error_message: data.errorMessage,
      error_stack:   data.errorStack  ?? null,
      component:     data.component   ?? null,
      severity:      data.severity    ?? "error",
    })
    .select("id")
    .single();

  if (error) {
    logger.warn({ err: error }, "devbotErrorCapture: insert failed");
    throw error;
  }

  logger.info({ id: row.id, page: data.pageUrl }, "devbot error captured");

  // Fire-and-forget Telegram alert
  void sendTelegramAlert(data);

  return row.id as string;
}

// ── getErrors ─────────────────────────────────────────────────────────────────

export async function getErrors(resolved?: boolean): Promise<ErrorRow[]> {
  const sb = getServiceClient();

  let query = sb
    .from("devbot_user_errors")
    .select("id, user_id, user_email, page_url, error_message, error_stack, component, severity, resolved, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (resolved !== undefined) {
    query = query.eq("resolved", resolved);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ErrorRow[];
}

// ── markResolved ──────────────────────────────────────────────────────────────

export async function markResolved(id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from("devbot_user_errors")
    .update({ resolved: true })
    .eq("id", id);
  if (error) throw error;
}
