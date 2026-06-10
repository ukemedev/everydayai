// ─── tokenBudget.ts ───────────────────────────────────────────────
// UTILITY: Token budget enforcement before every LLM provider call
//
// WHY this exists:
// → Groq free tier hard limit is 6,000 TPM
// → buildDocumentContext() dumps entire files with no size guard
// → Without this, any agent with a knowledge document crashes 100%
// → Both chat.ts and telegram.ts consume this — single source of truth
//
// APPROACH:
// → 1 token ≈ 4 characters (CHAR_4 heuristic — industry standard for
//   lightweight estimation without a full tokenizer)
// → Conservative ceiling means we slightly overestimate token count
//   which is exactly what we want — fail safe, never overshoot limit
//
// BUDGET ALLOCATION (Groq free tier — 6,000 TPM hard limit):
// → Doc context:    1,500 tokens (6,000 chars)
// → History:        1,500 tokens (6,000 chars)
// → Tools context:    500 tokens (2,000 chars)
// → Base instructions + current message + response: ~1,500 reserved
// → Total ceiling: ~5,000 tokens — safely under 6,000 TPM
// ──────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Budget constants — adjust here as provider tier changes ───────
export const BUDGET_DOC_CONTEXT    = 1_500; // tokens
export const BUDGET_HISTORY        = 1_500; // tokens
export const BUDGET_TOOLS_CONTEXT  =   500; // tokens

const CHARS_PER_TOKEN = 4; // CHAR_4 heuristic — 1 token ≈ 4 chars

/**
 * Estimates token count from a string using the CHAR_4 heuristic.
 * Uses Math.ceil so we always overestimate — safe for budget guards.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncates text to fit within a token budget.
 * If the text fits, it is returned unchanged.
 * If it exceeds the budget, it is sliced and a notice is appended.
 * The notice itself is short and always fits within the budget.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (text.length === 0) return "";

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) return text;

  // Reserve chars for the truncation notice so total never exceeds budget
  const notice = "\n[truncated: content exceeded token budget]";
  const sliceChars = maxChars - notice.length;

  // If budget is so small the notice itself doesn't fit, return just the notice
  if (sliceChars <= 0) return notice.trim();

  return text.slice(0, sliceChars) + notice;
}

/**
 * Trims conversation history to fit within a token budget.
 * Walks from newest to oldest, keeping messages that fit.
 * Always keeps the most recent message — never drops it.
 * Returns messages in original order (oldest → newest).
 */
export function truncateHistory(
  history: ConversationMessage[],
  maxTokens: number
): ConversationMessage[] {
  if (history.length === 0) return [];

  const budget = maxTokens * CHARS_PER_TOKEN;
  let total = 0;
  const kept: ConversationMessage[] = [];

  // Walk newest → oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const size = history[i].content.length;

    // Always keep the most recent message even if it alone exceeds budget
    if (kept.length === 0) {
      kept.unshift(history[i]);
      total += size;
      continue;
    }

    if (total + size > budget) break;

    total += size;
    kept.unshift(history[i]);
  }

  return kept;
}
