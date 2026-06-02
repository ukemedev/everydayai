// ─── Agent-level limits for public deployed chat ─────────────────────────────
//
// Six layers of protection:
//   1. Per-agent daily message cap (based on owner's plan)
//   2. Per-session message cap (based on owner's plan)
//   3. Per-IP rate limiting (handled via publicChatIpLimiter below)
//   4. Per-customer daily message cap (per sender, per agent)
//   5. Burst detection (max 3 messages within 30 seconds per customer)
//   6. Duplicate message detection (reject same message within 60 seconds)
//   7. AI cooldown (don't call AI for same customer within 3 seconds)
//
// In-memory storage resets on server restart, which is fine for a single-server
// deployment. Daily counters auto-reset when the UTC date changes.

// ─── Constants ────────────────────────────────────────────────────────────────

export const FRIENDLY_LIMIT_MESSAGE =
  "Thank you for chatting! Our agent has reached its limit for now. Please contact us directly or try again later.";

export const CUSTOMER_DAILY_LIMIT_MESSAGE =
  "You have reached the daily message limit for this chat. Please continue tomorrow or contact the business directly.";

export const BURST_LIMIT_MESSAGE =
  "Please slow down — you are sending too many messages quickly. Take a moment before sending another.";

export const DUPLICATE_MESSAGE =
  "It seems you sent the same message again. Please wait a moment or send a different question.";

export const COOLDOWN_MESSAGE =
  "Please wait a moment before sending another message.";

/** Daily message limits per plan (messages received by the agent from ALL visitors combined). */
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

// ─── Per-customer daily limits (per plan) ─────────────────────────────────────
//
// Each customer can only send this many messages to an agent per day.
// Prevents a single user from draining the entire agent daily quota.

export const CUSTOMER_DAILY_LIMITS: Record<string, number> = {
  free:     10,
  starter:  25,
  pro:      50,
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

// ─── Per-customer daily counter ───────────────────────────────────────────────
//
// Key: `agentId + ":" + customerId`
// Prevents one user from exhausting the agent's daily quota.

const customerCounters = new Map<string, DailyCounter>();

function getCustomerCounter(agentId: string, customerId: string): DailyCounter {
  const key = `${agentId}:${customerId}`;
  const today = utcDate();
  const existing = customerCounters.get(key);
  if (existing && existing.date === today) return existing;
  const fresh: DailyCounter = { count: 0, date: today };
  customerCounters.set(key, fresh);
  return fresh;
}

export function checkCustomerDailyLimit(
  agentId: string,
  customerId: string,
  plan: string
): { allowed: boolean; count: number; limit: number } {
  const limit = CUSTOMER_DAILY_LIMITS[plan] ?? CUSTOMER_DAILY_LIMITS.free;
  const counter = getCustomerCounter(agentId, customerId);
  return {
    allowed: limit === Infinity || counter.count < limit,
    count: counter.count,
    limit: limit === Infinity ? -1 : limit,
  };
}

export function incrementCustomerDailyCount(agentId: string, customerId: string): void {
  const counter = getCustomerCounter(agentId, customerId);
  counter.count++;
}

// ─── Burst detection ──────────────────────────────────────────────────────────
//
// A customer sending more than 3 messages within 30 seconds is considered spam.

interface BurstWindow {
  timestamps: number[]; // ms timestamps
  windowStart: number; // oldest timestamp
}

const burstWindows = new Map<string, BurstWindow>();
const BURST_LIMIT = 3;
const BURST_WINDOW_MS = 30 * 1000; // 30 seconds

export function checkBurstLimit(agentId: string, customerId: string): { allowed: boolean; count: number } {
  const key = `${agentId}:${customerId}`;
  const now = Date.now();
  const existing = burstWindows.get(key);

  if (!existing || now - existing.windowStart > BURST_WINDOW_MS) {
    // Fresh window
    burstWindows.set(key, { timestamps: [now], windowStart: now });
    return { allowed: true, count: 1 };
  }

  // Prune old timestamps
  existing.timestamps = existing.timestamps.filter((t) => now - t <= BURST_WINDOW_MS);
  existing.timestamps.push(now);
  existing.windowStart = existing.timestamps[0] ?? now;

  const count = existing.timestamps.length;
  return { allowed: count <= BURST_LIMIT, count };
}

// ─── Duplicate message detection ────────────────────────────────────────────────
//
// Rejects the exact same message text from the same customer within 60 seconds.

const lastMessages = new Map<string, { text: string; time: number }>();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60 seconds

export function isDuplicateMessage(agentId: string, customerId: string, message: string): boolean {
  const key = `${agentId}:${customerId}`;
  const now = Date.now();
  const last = lastMessages.get(key);

  if (last && now - last.time < DUPLICATE_WINDOW_MS && last.text === message.trim()) {
    return true;
  }

  lastMessages.set(key, { text: message.trim(), time: now });
  return false;
}

// ─── AI cooldown ───────────────────────────────────────────────────────────────
//
// Don't call the AI again for the same customer within 3 seconds.
// Prevents a spammer from racking up API costs before the burst limit kicks in.

const aiCooldowns = new Map<string, number>();
const AI_COOLDOWN_MS = 3 * 1000; // 3 seconds

export function isAiCooldownActive(agentId: string, customerId: string): boolean {
  const key = `${agentId}:${customerId}`;
  const now = Date.now();
  const last = aiCooldowns.get(key);
  return last !== undefined && now - last < AI_COOLDOWN_MS;
}

export function setAiCooldown(agentId: string, customerId: string): void {
  aiCooldowns.set(`${agentId}:${customerId}`, Date.now());
}

// ─── Prune stale entries from all in-memory maps every 5 minutes ─────────────

setInterval(() => {
  const now = Date.now();
  const staleDate = utcDate();

  // Prune stale customer counters
  for (const [key, counter] of customerCounters.entries()) {
    if (counter.date !== staleDate) customerCounters.delete(key);
  }

  // Prune stale burst windows
  for (const [key, bw] of burstWindows.entries()) {
    if (now - bw.windowStart > BURST_WINDOW_MS * 2) burstWindows.delete(key);
  }

  // Prune stale duplicate messages
  for (const [key, msg] of lastMessages.entries()) {
    if (now - msg.time > DUPLICATE_WINDOW_MS * 2) lastMessages.delete(key);
  }

  // Prune stale AI cooldowns
  for (const [key, time] of aiCooldowns.entries()) {
    if (now - time > AI_COOLDOWN_MS * 2) aiCooldowns.delete(key);
  }
}, 5 * 60 * 1000); // every 5 minutes
