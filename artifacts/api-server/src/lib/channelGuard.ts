import { getServiceClient } from "./supabaseService.js";

// ─── Shared guardrails for agent-to-channel deployment ───────────────────────

export interface AgentOwnershipResult {
  ok: boolean;
  agent: {
    id: string;
    user_id: string;
    name: string;
    model: string;
    instructions: string | null;
    status: string;
  } | null;
}

export interface ChannelExclusivityResult {
  blocked: boolean;
  existingChannel?: string;
}

/**
 * Verify that the given user owns the agent. Returns the agent row if ok.
 */
export async function verifyAgentOwnership(
  agentId: string,
  userId: string,
  supabase?: ReturnType<typeof getServiceClient>
): Promise<AgentOwnershipResult> {
  const sb = supabase ?? getServiceClient();
  if (!sb) return { ok: false, agent: null };

  const { data, error } = await sb
    .from("agents")
    .select("id, user_id, name, model, instructions, status")
    .eq("id", agentId)
    .maybeSingle();

  if (error || !data) return { ok: false, agent: null };
  if (data.user_id !== userId) return { ok: false, agent: null };

  return { ok: true, agent: data as AgentOwnershipResult["agent"] };
}

// All external channel deployment tables
const CHANNEL_TABLES: Record<string, string> = {
  telegram:  "telegram_deployments",
  whatsapp:  "whatsapp_deployments",
  messenger: "messenger_deployments",
  instagram: "instagram_deployments",
};

/**
 * Check that an agent is NOT already deployed to another external channel.
 * One agent → one external channel at a time. (Web widget is allowed on all.)
 */
export async function checkChannelExclusivity(
  agentId: string,
  channel: "telegram" | "whatsapp" | "messenger" | "instagram",
  supabase?: ReturnType<typeof getServiceClient>
): Promise<ChannelExclusivityResult> {
  const sb = supabase ?? getServiceClient();
  if (!sb) return { blocked: false };

  const otherChannels = Object.entries(CHANNEL_TABLES).filter(([ch]) => ch !== channel);

  for (const [ch, table] of otherChannels) {
    const { data } = await sb
      .from(table)
      .select("id")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .maybeSingle();
    if (data) return { blocked: true, existingChannel: ch };
  }

  return { blocked: false };
}
