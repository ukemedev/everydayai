// ─── rateLimiter.ts ───────────────────────────────────────────────
// Rate limiting middleware — all limiters live here
//
// WHY this exists:
// → Protects the platform from abuse, bots, and DDoS
// → Protects auth routes from brute force attacks
// → Protects deployed AI agents from credit drain
//
// PATTERN:
// → Each limiter has a named config object exported for testing
// → Config object is used to create the actual limiter
// → Tests verify config values — not internal middleware state
// ─────────────────────────────────────────────────────────────────

import { rateLimit, type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

// ── Shared handler factory ────────────────────────────────────────
function makeHandler(message: string): Options["handler"] {
  return (req: Request, res: Response) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method,
        requestId: req.id,
      },
      `Rate limit exceeded: ${message}`
    );
    res.status(429).json({ error: message });
  };
}

// ── Shared base config ────────────────────────────────────────────
const base = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
};

// ── Config objects (exported for testing) ─────────────────────────

// ── General limiter — why 600 not 100 ────────────────────────────────────────
//
// The Inbox page polls two endpoints every 5 seconds while it is open:
//   GET /api/conversations         → 12 req/min
//   GET /api/conversations/:id/messages → 12 req/min (conversation selected)
// Total: 24 req/min × 15 min = 360 requests per 15-min window per user.
//
// The previous limit of 100/15 min caused users to be blocked after ~4 minutes
// of inbox use, making all inbox updates silently 429 until the window reset.
// This is why the "inbox stops receiving messages" problem was recurring.
//
// 600/15 min = 40 req/min provides comfortable headroom above the 24-req/min
// inbox polling baseline while still protecting against scripted abuse.
export const generalLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  handler: makeHandler("Too many requests. Please try again later."),
};

export const chatLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 60 * 1000,
  limit: 30,
  handler: makeHandler("Too many messages. Please wait a moment."),
};

export const authLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: makeHandler("Too many attempts. Please wait 15 minutes."),
};

export const uploadLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 60 * 1000,
  limit: 10,
  handler: makeHandler("Too many uploads. Please wait a moment."),
};

export const webhookLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
  handler: makeHandler("Too many requests."),
};

export const publicPollingLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
  handler: makeHandler("Too many requests. Please slow down."),
};

export const publicAgentInfoLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 5 * 60 * 1000,
  limit: 30,
  handler: makeHandler("Too many requests. Please try again later."),
};

export const deployLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  handler: makeHandler("Too many deployment attempts. Please wait an hour."),
};

// ── Webhook limiter factory — one instance per channel ────────────────────────
//
// CRITICAL: do NOT use a single IP-keyed limiter for webhook endpoints.
// Meta (WhatsApp, Messenger, Instagram) and Telegram deliver ALL webhooks from
// a small pool of their own server IPs. A shared IP bucket means every agent
// on the platform competes for the same 120 req/min allowance — a moderate
// platform load (20 agents × 8 msg/min = 160 req/min) starts silently dropping
// legitimate customer messages.
//
// Fix: key by agentId extracted from the URL path so each deployed agent gets
// its own independent 120 req/min bucket regardless of the source IP.
//
// Usage: call makeWebhookLimiter() once per channel at router setup time so
// each channel has its own MemoryStore — a single instance shared across all
// four channels would re-introduce cross-channel key collisions for the same
// agentId.

export function makeWebhookLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    ...base,
    windowMs: 60 * 1000,
    limit: 120,
    keyGenerator: (req: Request): string => {
      // req.path here is the sub-path AFTER the mount point (e.g. "/abc123-...")
      // because the limiter is mounted with router.use("/whatsapp/webhook", ...).
      // We intentionally do NOT fall back to req.ip — webhook buckets are
      // per-agent, not per-IP, so there is no valid IP fallback here.
      const agentId = req.path.replace(/^\//, "").split("/")[0];
      return `webhook:${agentId || "unknown"}`;
    },
    validate: { keyGeneratorIpFallback: false },
    handler: makeHandler("Too many requests."),
  });
}

// ── Actual middleware limiters ────────────────────────────────────
export const generalLimiter = rateLimit(generalLimiterConfig);
export const chatLimiter = rateLimit(chatLimiterConfig);
export const authLimiter = rateLimit(authLimiterConfig);
export const uploadLimiter = rateLimit(uploadLimiterConfig);
export const webhookLimiter = rateLimit(webhookLimiterConfig);
export const publicPollingLimiter = rateLimit(publicPollingLimiterConfig);
export const publicAgentInfoLimiter = rateLimit(publicAgentInfoLimiterConfig);
export const deployLimiter = rateLimit(deployLimiterConfig);
