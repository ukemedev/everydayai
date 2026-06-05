// ─── IAgentRepository.ts ──────────────────────────────────────────
// PORT (Contract)
//
// WHY this exists:
// → Two completely separate methods for two different situations
// → findByOwner → studio tab (draft agents must work here)
// → findLive → public widget (only live agents allowed)
//
// THIS IS THE CORE FIX FOR YOUR TEST AGENT BUG:
// → Old code used one method with status "live" filter everywhere
// → Draft agents were silently blocked in studio
// → Now studio and public have separate methods
// → Draft agents work in studio forever ✅
// ──────────────────────────────────────────────────────────────────

export type Agent = {
  id: string;           // agent UUID
  user_id: string;      // owner's user ID
  model: string;        // e.g. "gpt-4o-mini"
  instructions: string; // agent system prompt
  status: "draft" | "testing" | "live";
};

export interface IAgentRepository {
  /**
   * For Studio tab — owner testing their OWN agent.
   *
   * NO status filter — draft, testing, and live all work.
   * Security check: agent MUST belong to this userId.
   * Returns null if agent not found OR user doesn't own it.
   * Never leaks whether agent exists to wrong user.
   */
  findByOwner(agentId: string, userId: string): Promise<Agent | null>;

  /**
   * For public widget — stranger chatting with deployed bot.
   *
   * MUST be live — draft agents never exposed to public.
   * No user check needed — public access by agentId only.
   * Returns null if not found or not live.
   */
  findLive(agentId: string): Promise<Agent | null>;
}
