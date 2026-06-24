import { getServiceClient } from "./supabaseService.js";
import { logger } from "./logger.js";
import { getRedisClient } from "./redisClient.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import {
  limitWarningEmailHtml,
  limitWarningEmailSubject,
  limitReachedEmailHtml,
  limitReachedEmailSubject,
} from "./emails/limitWarning.js";

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<string, { agents: number; messagesPerMonth: number }> = {
  free:    { agents: 1, messagesPerMonth: 200    },
  starter: { agents: 3, messagesPerMonth: 2_000  },
  pro:     { agents: 5, messagesPerMonth: 10_000 },
};

// Max number of webhook tools an agent can have per plan
export const PLAN_TOOL_LIMITS: Record<string, number> = {
  free:    1,
  starter: 3,
  pro:     5,
};

// Channels available per plan
export const PLAN_CHANNELS: Record<string, string[]> = {
  free:    ["web"],
  starter: ["web", "whatsapp"],
  pro:     ["web", "whatsapp"],
};

// Input capabilities per plan
export const PLAN_CAPABILITIES: Record<string, string[]> = {
  free:    ["text"],
  starter: ["text", "files"],
  pro:     ["text", "files", "images", "voice"],
};

// ─── Redis-backed plan limit gate ─────────────────────────────────────────────

/** Number of messages a free user gets before they must upgrade. */
export const FREE_TRIAL_LIMIT = 20;

/** Message shown to free users when they exhaust their trial allowance. */
export const UPGRADE_MESSAGE = "You've used your free messages. Upgrade to continue.";

/** TTL applied to each Redis usage key — resets the counter every 30 days. */
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;

export type PlanLimitResult =
  | { allowed: true;  current: number; limit: number }
  | { allowed: false; current: number; limit: number; message: string };

/**
 * checkPlanLimit — Redis-backed pre-flight gate for every AI message.
 *
 * Flow:
 *   1. Look up user plan from Supabase (fail-open → "free")
 *   2. INCR the Redis key `usage:${userId}:messages`
 *   3. If new key → set 30-day EXPIRE
 *   4. If count > limit → DECR + return { allowed: false, message }
 *   5. Redis unavailable → fail-open (never block because of infra failure)
 */
export async function checkPlanLimit(userId: string): Promise<PlanLimitResult> {
  // ── Step 1: resolve plan (fail-open) ────────────────────────────
  let plan = "free";
  try {
    const sb = getServiceClient();
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

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const limit  = plan === "free" ? FREE_TRIAL_LIMIT : limits.messagesPerMonth;

  // ── Step 2: Redis counter ────────────────────────────────────────
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return { allowed: true, current: 0, limit };
  }

  try {
    const redis    = getRedisClient(redisUrl);
    const redisKey = `usage:${userId}:messages`;
    const newCount = await redis.incr(redisKey);

    if (newCount === 1) {
      await redis.expire(redisKey, REDIS_TTL_SECONDS);
    }

    if (newCount > limit) {
      await redis.decr(redisKey);
      return { allowed: false, current: newCount - 1, limit, message: UPGRADE_MESSAGE };
    }

    return { allowed: true, current: newCount, limit };

  } catch (err) {
    logger.error({ err, userId }, "Redis plan limit check failed — failing open");
    return { allowed: true, current: 0, limit };
  }
}

// ─── Plan helpers ─────────────────────────────────────────────────────────────

export async function getUserPlan(user_id: string): Promise<string> {
  const sb = getServiceClient();
  if (!sb) return "free";

  const { data, error } = await sb
    .from("profiles")
    .select("plan")
    .eq("id", user_id)
    .single();

  if (error || !data) return "free";
  return (data.plan as string | null) ?? "free";
}

// ─── Message limit (DB-backed monthly counter) ────────────────────────────────
// Used by the WhatsApp/widget paths that don't go through Redis.

const warningEmailSent = new Set<string>();
const limitEmailSent   = new Set<string>();

async function maybeFireLimitEmail(
  user_id:  string,
  email:    string,
  fullName: string,
  plan:     string,
  current:  number,
  limit:    number,
): Promise<void> {
  if (!isEmailConfigured()) return;

  const pct       = (current / limit) * 100;
  const firstName = fullName.split(" ")[0] ?? fullName;

  if (pct >= 100 && !limitEmailSent.has(user_id)) {
    limitEmailSent.add(user_id);
    warningEmailSent.add(user_id);
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
  if (!sb) return { allowed: true, current: 0, limit: Infinity };

  const { data, error } = await sb
    .from("profiles")
    .select("plan, message_count, message_count_reset_at, email, full_name")
    .eq("id", user_id)
    .single();

  if (error || !data) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  const plan    = (data.plan as string | null) ?? "free";
  const limits  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const current = (data.message_count as number | null) ?? 0;
  const email   = (data.email as string | null) ?? "";
  const name    = (data.full_name as string | null) ?? "";
  const limit   = limits.messagesPerMonth;

  // Reset counter if it has been more than 30 days since last reset
  const resetAt   = new Date((data.message_count_reset_at as string) ?? 0);
  const daysSince = (Date.now() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 30) {
    await sb
      .from("profiles")
      .update({ message_count: 0, message_count_reset_at: new Date().toISOString() })
      .eq("id", user_id);
    warningEmailSent.delete(user_id);
    limitEmailSent.delete(user_id);
    return { allowed: true, current: 0, limit };
  }

  const allowed = current < limit;

  if (email) {
    void maybeFireLimitEmail(user_id, email, name, plan, current, limit);
  }

  return { allowed, current, limit };
}