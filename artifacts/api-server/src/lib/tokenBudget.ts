export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export const BUDGET_DOC_CONTEXT   = 1_500; // tokens
export const BUDGET_HISTORY       = 1_500; // tokens
export const BUDGET_TOOLS_CONTEXT =   500; // tokens

const CHARS_PER_TOKEN = 4; // 1 token ≈ 4 chars (CHAR_4 heuristic)

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (text.length === 0) return "";

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  const notice = "\n[truncated: content exceeded token budget]";
  const sliceChars = maxChars - notice.length;

  if (sliceChars <= 0) return notice.trim();

  return text.slice(0, sliceChars) + notice;
}

export function truncateHistory(
  history: ConversationMessage[],
  maxTokens: number
): ConversationMessage[] {
  if (history.length === 0) return [];

  const budget = maxTokens * CHARS_PER_TOKEN;
  let total = 0;
  const kept: ConversationMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const size = history[i].content.length;

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