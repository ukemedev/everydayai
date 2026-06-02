// ─── Agent-level limits for public deployed chat ─────────────────────────────
//
// Three layers of protection:
//   1. Per-agent daily message cap (based on owner's plan)
//   2. Per-session message cap (based on owner's plan)
//   3. Per-IP rate limiting (handled via publicChatIpLimiter below)
//
// In-memory storage resets on server restart, which is fine for a single-server
// deployment. Daily counters auto-reset when the UTC date changes.

// ─── Constants ────────────────────────────────────────────────────────────────

export const FRIENDLY_LIMIT_MESSAGE =
  "Thank you for chatting! Our agent has reached its limit for now. Please contact us directly or try again later.";

/** Daily message limits per plan (messages received by the agent from all visitors combined). */
export const AGENT_DAILY_LIMITS: Record<string, number> = {
  free:     100,
  starter:  500,
  pro:      2000,
  business: Infinity,
};

/** Max messages in a single conversation session, per plan. */
export const SESSION_LIMITS: Record<string, number> = {
  free:     15,
  starter:  Infinity,
  pro:      Infinity,
  business: Infinity,
};

// ─── Per-agent daily counter ──────────────────────────────────────────────────

interface DailyCounter {
  count: number;
  date:  string; // YYYY-MM-DD UTC
}

const agentCounters = new Map<string, DailyCounter>();

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCounter(agentId: string): DailyCounter {
  const today   = utcDate();
  const existing = agentCounters.get(agentId);
  if (existing && existing.date === today) return existing;
  // New day — reset counter
  const fresh: DailyCounter = { count: 0, date: today };
  agentCounters.set(agentId, fresh);
  return fresh;
}

export function checkAgentDailyLimit(
  agentId: string,
  plan: string
): { allowed: boolean; count: number; limit: number } {
  const limit   = AGENT_DAILY_LIMITS[plan] ?? AGENT_DAILY_LIMITS.free;
  const counter = getCounter(agentId);
  return {
    allowed: limit === Infinity || counter.count < limit,
    count:   counter.count,
    limit:   limit === Infinity ? -1 : limit,
  };
}

export function incrementAgentDailyCount(agentId: string): void {
  const counter = getCounter(agentId);
  counter.count++;
}

// ─── Session limit ────────────────────────────────────────────────────────────

/**
 * Returns true if the session is still within its message limit.
 * `userMessageCount` = number of user turns already in the conversation history
 * (i.e. BEFORE the current message is added).
 */
export function checkSessionLimit(plan: string, userMessageCount: number): boolean {
  const limit = SESSION_LIMITS[plan] ?? SESSION_LIMITS.free;
  return limit === Infinity || userMessageCount < limit;
}

// ─── Per-IP rate limiter (for public chat endpoints) ─────────────────────────
//
// Keeps a simple sliding-window counter per IP.
// 10 messages per 60-second window.

interface IpWindow {
  count:    number;
  windowStart: number; // ms timestamp
}

const ipWindows = new Map<string, IpWindow>();

const PUBLIC_CHAT_IP_LIMIT    = 10;
const PUBLIC_CHAT_WINDOW_MS   = 60 * 1000; // 1 minute

export function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const win = ipWindows.get(ip);

  if (!win || now - win.windowStart >= PUBLIC_CHAT_WINDOW_MS) {
    // New or expired window
    ipWindows.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: PUBLIC_CHAT_IP_LIMIT - 1 };
  }

  if (win.count >= PUBLIC_CHAT_IP_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  win.count++;
  return { allowed: true, remaining: PUBLIC_CHAT_IP_LIMIT - win.count };
}

// Periodically prune stale IP windows to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - PUBLIC_CHAT_WINDOW_MS * 2;
  for (const [ip, win] of ipWindows.entries()) {
    if (win.windowStart < cutoff) ipWindows.delete(ip);
  }
}, 5 * 60 * 1000); // every 5 minutes
