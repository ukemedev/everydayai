import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "../lib/planLimits.js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getTodayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getDayStart(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── GET /api/analytics ─────────────────────────────────────────────────────

router.get("/analytics", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const todayStart = getTodayStart();

  try {
    // Profile + plan info
    const { data: profile } = await sb
      .from("profiles")
      .select("plan, message_count")
      .eq("id", userId)
      .single();

    const plan = (profile?.plan as string) ?? "free";
    const messageCount = (profile?.message_count as number) ?? 0;
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
    const messageLimit = limits.messagesPerMonth === Infinity ? null : limits.messagesPerMonth;
    const agentLimit = limits.agents === Infinity ? null : limits.agents;

    // Agent counts
    const { data: agents, count: totalAgents } = await sb
      .from("agents")
      .select("id, status", { count: "exact" })
      .eq("user_id", userId);

    const liveAgents = agents?.filter((a) => (a as { status: string }).status === "live").length ?? 0;

    // Conversation counts
    const { count: totalConversations } = await sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);

    const { count: conversationsToday } = await sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .gte("created_at", todayStart);

    // Fetch all conversation IDs for this user
    const { data: convRows } = await sb
      .from("conversations")
      .select("id")
      .eq("owner_id", userId);
    const convIds = (convRows ?? []).map((r) => (r as { id: string }).id);

    // Total messages
    const { count: totalMessages } = convIds.length > 0
      ? await sb.from("messages").select("id", { count: "exact", head: true }).in("conversation_id", convIds)
      : { count: 0 };

    // Messages today
    const { count: messagesToday } = convIds.length > 0
      ? await sb
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", convIds)
          .gte("created_at", todayStart)
      : { count: 0 };

    // 7-day message volume
    const dailyVolume: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = getDayStart(i);
      const dayEnd = i === 0 ? new Date().toISOString() : getDayStart(i - 1);
      const { count } = convIds.length > 0
        ? await sb
            .from("messages")
            .select("id", { count: "exact", head: true })
            .in("conversation_id", convIds)
            .gte("created_at", dayStart)
            .lt("created_at", dayEnd)
        : { count: 0 };
      dailyVolume.push(count ?? 0);
    }

    // Recent activity (last 5 messages)
    const { data: recentMessages } = convIds.length > 0
      ? await sb
          .from("messages")
          .select("id, role, content, created_at, conversation_id")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(5)
      : { data: [] };

    // Conversation names for recent messages
    const activityConvIds = (recentMessages ?? []).map((m) => (m as { conversation_id: string }).conversation_id);
    const { data: convNames } =
      activityConvIds.length > 0
        ? await sb
            .from("conversations")
            .select("id, agent_name, customer_display")
            .in("id", activityConvIds)
        : { data: [] };

    const convNameMap = new Map<string, string>();
    for (const c of convNames ?? []) {
      const row = c as { id: string; agent_name: string | null; customer_display: string | null };
      convNameMap.set(row.id, row.agent_name ?? row.customer_display ?? "Conversation");
    }

    const activity = (recentMessages ?? []).map((m) => {
      const row = m as { id: string; role: string; content: string; created_at: string; conversation_id: string };
      return {
        id: row.id,
        role: row.role,
        preview: row.content.slice(0, 80),
        created_at: row.created_at,
        conversation_name: convNameMap.get(row.conversation_id) ?? "Conversation",
      };
    });

    res.json({
      summary: {
        totalAgents: totalAgents ?? 0,
        liveAgents,
        totalConversations: totalConversations ?? 0,
        conversationsToday: conversationsToday ?? 0,
        totalMessages: totalMessages ?? 0,
        messagesToday: messagesToday ?? 0,
      },
      planUsage: {
        plan,
        messageCount,
        messageLimit,
        agentCount: totalAgents ?? 0,
        agentLimit,
      },
      dailyVolume,
      activity,
    });
  } catch (err) {
    req.log.error({ err, userId }, "analytics: failed to fetch data");
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
