// ─── SupabaseAgentRepository.ts ───────────────────────────────────
// ADAPTER (Real Worker)
//
// WHY this exists:
// → Real implementation of IAgentRepository
// → Two separate methods for two different contexts
// → findByOwner: NO status filter (draft works in studio)
// → findLive: status = "live" only (public widget)
//
// THIS FILE CONTAINS THE ACTUAL BUG FIX:
// → findByOwner queries by user_id only — no status check
// → Draft agents now work in Test Agent tab forever
// → findLive still protects public from seeing draft agents
//
// TABLE: agents
// COLUMNS USED: id, user_id, model, instructions, status
// ──────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { IAgentRepository, Agent } from "../ports/IAgentRepository.js";
import { logger } from "../lib/logger.js";

export class SupabaseAgentRepository implements IAgentRepository {

  constructor(
    // Supabase client injected in
    private sb: ReturnType<typeof createClient>
  ) {}

  async findByOwner(agentId: string, userId: string): Promise<Agent | null> {
    try {
      const { data, error } = await this.sb
        .from("agents")
        .select("id, user_id, model, instructions, status")
        .eq("id", agentId)
        .eq("user_id", userId)
        // ↑ SECURITY: agent must belong to this user
        // NO .eq("status", "live") here — that was the bug
        // Draft, testing, and live all work for the owner
        .maybeSingle();

      if (error) {
        logger.error({ error, agentId, userId }, "SupabaseAgentRepository: DB error in findByOwner");
        return null;
      }

      if (!data) {
        // Agent not found OR doesn't belong to this user
        // We return null for both cases intentionally
        // Never reveal whether agent exists to wrong user
        logger.info({ agentId, userId }, "SupabaseAgentRepository: agent not found or not owned");
        return null;
      }

      return data as Agent;

    } catch (err) {
      logger.error({ err, agentId, userId }, "SupabaseAgentRepository: unexpected error in findByOwner");
      return null;
    }
  }

  async findLive(agentId: string): Promise<Agent | null> {
    try {
      const { data, error } = await this.sb
        .from("agents")
        .select("id, user_id, model, instructions, status")
        .eq("id", agentId)
        .eq("status", "live")
        // ↑ Public MUST only see live agents
        // Draft agents are never exposed to public visitors
        .maybeSingle();

      if (error) {
        logger.error({ error, agentId }, "SupabaseAgentRepository: DB error in findLive");
        return null;
      }

      if (!data) {
        logger.info({ agentId }, "SupabaseAgentRepository: no live agent found");
        return null;
      }

      return data as Agent;

    } catch (err) {
      logger.error({ err, agentId }, "SupabaseAgentRepository: unexpected error in findLive");
      return null;
    }
  }
}
