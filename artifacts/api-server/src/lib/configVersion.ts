import type { SupabaseClient } from "@supabase/supabase-js";

export async function bumpAgentConfigVersion(sb: SupabaseClient, agentId: string): Promise<void> {
  const { error } = await sb
    .from("agents")
    .update({ config_updated_at: new Date().toISOString() })
    .eq("id", agentId);
  if (error) {
    // Column may not exist yet (migration pending) — log and continue gracefully
    console.warn("[configVersion] bumpAgentConfigVersion failed:", error.message);
  }
}
