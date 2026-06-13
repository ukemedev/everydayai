import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";
import { getRedisClient } from "./redisClient.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { limitWarningEmailHtml, limitWarningEmailSubject, limitReachedEmailHtml, limitReachedEmailSubject } from "./emails/limitWarning.js";

export const PLAN_LIMITS: Record<string, { agents: number; messagesPerMonth: number }> = {
  free:     { agents: 1,        messagesPerMonth: 200       },
  starter:  { agents: 3,        messagesPerMonth: 2_000     },
  pro:      { agents: 10,       messagesPerMonth: 10_000    },
  business: { agents: Infinity, messagesPerMonth: Infinity  },
};

// ─── Redis-backed plan limit gate ─────────────────────────────────────────────

/** Number of messages a free-trial user gets before they must upgrade. */
export const FREE_TRIAL_LIMIT = 20;

/** Message shown to free users when they have exhausted their trial allowance. */
export const UPGRADE_MESSAGE = "You've used your free messages. Upgrade to continue.";

/** TTL applied to each Redis usage key — resets the counter every 30 days. */
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;

export type PlanLimitResult =
  | { allowed: true;  current: number; limit: number }
  | { allowed: false; current: number; limit: number; message: string };

/** Returns a Supabase service client or null if env vars are missing — never throws. */
function getServiceClientOrNull() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * checkPlanLimit — Redis-backed pre-flight gate for every AI message.
 *
 * Flow:
 *   1. Look up user plan from Supabase (fail-open → "free")
 *   2. Unlimited plans (pro/business) skip the counter entirely
 *   3. INCR the Redis key `usage:${userId}:messages`
 *   4. If new key → set 30-day EXPIRE
 *   5. If count > limit → DECR + return { allowed: false, message }
 *   6. Redis unavailable → fail-open (never block because of infra failure)
 */
export async function checkPlanLimit(userId: string): Promise<PlanLimitResult> {
  // ── Step 1: resolve plan (fail-open) ────────────────────────────
  let plan = "free";
  try {
    const sb = getServiceClientOrNull();
    if (sb) {
      const { data, error } = await sb
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .single();
      if (!error && data?.plan) plan = data.plan as string;
    }
  } catch {
    // fail-open — unknown plan defaults to "free"
  }

  // ── Step 2: unlimited plans skip the counter entirely ────────────
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  if (limits.messagesPerMonth === Infinity) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  // ── Step 3: resolve the effective trial limit ────────────────────
  const limit = plan === "free" ? FREE_TRIAL_LIMIT : limits.messagesPerMonth;

  // ── Step 4: Redis counter ────────────────────────────────────────
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // No Redis configured — fail-open
    return { allowed: true, current: 0, limit };
  }

  try {
    const redis = getRedisClient(redisUrl);
    const redisKey = `usage:${userId}:messages`;

    const newCount = await redis.incr(redisKey);

    // Set TTL only on the very first message (new key)
    if (newCount === 1) {
      await redis.expire(redisKey, REDIS_TTL_SECONDS);
    }

    if (newCount > limit) {
      // Reverse the increment — blocked requests must not consume quota
      await redis.decr(redisKey);
      return {
        allowed: false,
        current: newCount - 1,
        limit,
        message: UPGRADE_MESSAGE,
      };
    }

    return { allowed: true, current: newCount, limit };

  } catch (err) {
    logger.error({ err, userId }, "Redis plan limit check failed — failing open");
    return { allowed: true, current: 0, limit };
  }
}

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
  const url = process.env.SUPABASE_URL;
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

  // Fail-open: if the DB query errors, don't block the user
  if (error || !data) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  const plan    = (data.plan as string | null) ?? "free";
  const limits  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const current = (data.message_count as number | null) ?? 0;
  const email   = (data.email as string | null) ?? "";
  const name    = (data.full_name as string | null) ?? "";

  // Business and pro plans have unlimited messages — skip the counter entirely
  if (limits.messagesPerMonth === Infinity) {
    return { allowed: true, current, limit: Infinity };
  }

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
  const allowed = current < limit;

  // Fire email if at 80% or 100% threshold
  if (email) {
    void maybeFireLimitEmail(user_id, email, name, plan, current, limit);
  }

  return { allowed, current, limit };
}
