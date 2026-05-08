import { createClient } from "@supabase/supabase-js";

export const PLAN_LIMITS: Record<string, { agents: number; messagesPerMonth: number }> = {
  free:     { agents: 1,        messagesPerMonth: 50       },
  starter:  { agents: 3,        messagesPerMonth: 500      },
  pro:      { agents: 10,       messagesPerMonth: Infinity },
  business: { agents: Infinity, messagesPerMonth: Infinity },
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

export async function checkMessageLimit(
  user_id: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("profiles")
    .select("plan, message_count, message_count_reset_at")
    .eq("id", user_id)
    .single();

  if (error || !data) {
    return { allowed: false, current: 0, limit: PLAN_LIMITS.free.messagesPerMonth };
  }

  const plan    = (data.plan as string | null) ?? "free";
  const limits  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const current = (data.message_count as number | null) ?? 0;

  // Reset counter if it's been more than 30 days since last reset
  const resetAt  = new Date((data.message_count_reset_at as string) ?? 0);
  const daysSince = (Date.now() - resetAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 30) {
    await sb
      .from("profiles")
      .update({ message_count: 0, message_count_reset_at: new Date().toISOString() })
      .eq("id", user_id);
    return { allowed: true, current: 0, limit: limits.messagesPerMonth };
  }

  const limit   = limits.messagesPerMonth;
  const allowed = limit === Infinity || current < limit;

  return { allowed, current, limit };
}
