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

export const generalLimiterConfig: Partial<Options> = {
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 100,
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

// ── Actual middleware limiters ────────────────────────────────────
export const generalLimiter = rateLimit(generalLimiterConfig);
export const chatLimiter = rateLimit(chatLimiterConfig);
export const authLimiter = rateLimit(authLimiterConfig);
export const uploadLimiter = rateLimit(uploadLimiterConfig);
export const webhookLimiter = rateLimit(webhookLimiterConfig);
export const publicPollingLimiter = rateLimit(publicPollingLimiterConfig);
export const publicAgentInfoLimiter = rateLimit(publicAgentInfoLimiterConfig);
export const deployLimiter = rateLimit(deployLimiterConfig);
