import { createClient } from "@supabase/supabase-js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { limitWarningEmailHtml, limitWarningEmailSubject, limitReachedEmailHtml, limitReachedEmailSubject } from "./emails/limitWarning.js";

export const PLAN_LIMITS: Record<string, { agents: number; messagesPerMonth: number }> = {
  free:     { agents: 1,        messagesPerMonth: 200       },
  starter:  { agents: 3,        messagesPerMonth: 2_000     },
  pro:      { agents: 10,       messagesPerMonth: 10_000    },
  business: { agents: Infinity, messagesPerMonth: Infinity  },
};

// Tools available per plan (connector IDs)
export const PLAN_TOOLS: Record<string, string[]> = {
  free:     [],
  starter:  ["google_sheets", "gmail", "telegram", "termii"],
  pro:      ["google_sheets", "gmail", "telegram", "termii", "paystack", "hubspot", "web_search", "google_calendar", "google_drive", "vapi"],
  business: ["google_sheets", "gmail", "telegram", "termii", "paystack", "hubspot", "web_search", "google_calendar", "google_drive", "vapi"],
};

// Channels available per plan
export const PLAN_CHANNELS: Record<string, string[]> = {
  free:     ["web"],
  starter:  ["web", "telegram", "whatsapp"],           // 1 external channel
  pro:      ["web", "telegram", "whatsapp", "messenger", "instagram"],
  business: ["web", "telegram", "whatsapp", "messenger", "instagram"],
};

// Input capabilities per plan
export const PLAN_CAPABILITIES: Record<string, string[]> = {
  free:     ["text"],
  starter:  ["text", "files"],
  pro:      ["text", "files", "images", "voice"],
  business: ["text", "files", "images", "voice"],
};

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service client not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getUserPlan(user_id: string): Promise<string> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("profiles")
    .select("plan")
    .eq("id", user_id)
    .single();

  if (error || !data) return "free";
  return (data.plan as string | null) ?? "free";
}

// ─── Email thresholds ─────────────────────────────────────────────────────────
// Track which users have already received warning/limit emails this cycle
// (in-memory — resets on server restart, which is fine; duplicate sends are
// low-severity and the DB-based monthly reset is the source of truth).
const warningEmailSent = new Set<string>(); // user_id
const limitEmailSent   = new Set<string>(); // user_id

async function maybeFireLimitEmail(
  user_id:  string,
  email:    string,
  fullName: string,
  plan:     string,
  current:  number,
  limit:    number,
): Promise<void> {
  if (!isEmailConfigured() || limit === Infinity) return;

  const pct = (current / limit) * 100;
  const firstName = fullName.split(" ")[0] ?? fullName;

  if (pct >= 100 && !limitEmailSent.has(user_id)) {
    limitEmailSent.add(user_id);
    warningEmailSent.add(user_id); // suppress warning too
    void sendEmail({
      to:      email,
      subject: limitReachedEmailSubject(),
      html:    limitReachedEmailHtml({ firstName, email, plan, limit }),
    });
    return;
  }

  if (pct >= 80 && !warningEmailSent.has(user_id)) {
    warningEmailSent.add(user_id);
    void sendEmail({
      to:      email,
      subject: limitWarningEmailSubject(pct),
      html:    limitWarningEmailHtml({ firstName, email, plan, current, limit, percentUsed: pct }),
    });
  }
}

export async function checkMessageLimit(
  user_id: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("profiles")
    .select("plan, message_count, message_count_reset_at, email, full_name")
    .eq("id", user_id)
    .single();

  if (error || !data) {
    return { allowed: false, current: 0, limit: PLAN_LIMITS.free.messagesPerMonth };
  }

  const plan    = (data.plan as string | null) ?? "free";
  const limits  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const current = (data.message_count as number | null) ?? 0;
  const email   = (data.email as string | null) ?? "";
  const name    = (data.full_name as string | null) ?? "";

  // Reset counter if it's been more than 30 days since last reset
  const resetAt   = new Date((data.message_count_reset_at as string) ?? 0);
  const daysSince = (Date.now() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 30) {
    await sb
      .from("profiles")
      .update({ message_count: 0, message_count_reset_at: new Date().toISOString() })
      .eq("id", user_id);
    // Clear email throttle flags on monthly reset
    warningEmailSent.delete(user_id);
    limitEmailSent.delete(user_id);
    return { allowed: true, current: 0, limit: limits.messagesPerMonth };
  }

  const limit   = limits.messagesPerMonth;
  const allowed = limit === Infinity || current < limit;

  // Fire email if at 80% or 100% threshold
  if (email) {
    void maybeFireLimitEmail(user_id, email, name, plan, current, limit);
  }

  return { allowed, current, limit };
}
