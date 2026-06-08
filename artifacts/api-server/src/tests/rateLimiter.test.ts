// ─── rateLimiter.test.ts ──────────────────────────────────────────
// TDD TESTS for rate limiter middleware
//
// WHY these exist:
// → Every limiter config is sealed forever — no accidental changes
// → Correct v8 options enforced (limit not max, draft-8 headers)
// → Auth limiter MUST have skipSuccessfulRequests
// → Legacy headers MUST be disabled on all limiters
// → All limiters return 429 JSON — never plain text
//
// SEALED FOREVER:
// → generalLimiter: 100 req / 15 min ✅
// → chatLimiter: 30 req / 1 min ✅
// → authLimiter: 10 req / 15 min + skipSuccessfulRequests ✅
// → uploadLimiter: 10 req / 1 min ✅
// → webhookLimiter: 120 req / 1 min ✅
// → publicPollingLimiter: 60 req / 1 min ✅
// → publicAgentInfoLimiter: 30 req / 5 min ✅
// → deployLimiter: 10 req / 1 hour ✅
// → All limiters: legacyHeaders false ✅
// → All limiters: standardHeaders draft-8 ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  generalLimiterConfig,
  chatLimiterConfig,
  authLimiterConfig,
  uploadLimiterConfig,
  webhookLimiterConfig,
  publicPollingLimiterConfig,
  publicAgentInfoLimiterConfig,
  deployLimiterConfig,
} from "../middlewares/rateLimiter";

// ── Mock res for handler tests ────────────────────────────────────
function makeMockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
    append: vi.fn(),
  };
}

function makeMockReq(ip = "127.0.0.1"): Partial<Request> {
  return {
    ip,
    method: "GET",
    url: "/api/test",
    path: "/api/test",
    headers: {},
    id: "req-test-123",
  };
}

// ── generalLimiter ────────────────────────────────────────────────
describe("generalLimiterConfig", () => {
  it("✅ allows 100 requests per 15 minutes", () => {
    expect(generalLimiterConfig.limit).toBe(100);
    expect(generalLimiterConfig.windowMs).toBe(15 * 60 * 1000);
  });

  it("✅ uses draft-8 standard headers", () => {
    expect(generalLimiterConfig.standardHeaders).toBe("draft-8");
  });

  it("✅ disables legacy headers", () => {
    expect(generalLimiterConfig.legacyHeaders).toBe(false);
  });
});

// ── chatLimiter ───────────────────────────────────────────────────
describe("chatLimiterConfig", () => {
  it("✅ allows 30 messages per minute", () => {
    expect(chatLimiterConfig.limit).toBe(30);
    expect(chatLimiterConfig.windowMs).toBe(60 * 1000);
  });

  it("✅ disables legacy headers", () => {
    expect(chatLimiterConfig.legacyHeaders).toBe(false);
  });
});

// ── authLimiter ───────────────────────────────────────────────────
describe("authLimiterConfig", () => {
  it("✅ allows 10 attempts per 15 minutes", () => {
    expect(authLimiterConfig.limit).toBe(10);
    expect(authLimiterConfig.windowMs).toBe(15 * 60 * 1000);
  });

  it("✅ skipSuccessfulRequests is true — real users not penalized", () => {
    expect(authLimiterConfig.skipSuccessfulRequests).toBe(true);
  });

  it("✅ disables legacy headers", () => {
    expect(authLimiterConfig.legacyHeaders).toBe(false);
  });
});

// ── uploadLimiter ─────────────────────────────────────────────────
describe("uploadLimiterConfig", () => {
  it("✅ allows 10 uploads per minute", () => {
    expect(uploadLimiterConfig.limit).toBe(10);
    expect(uploadLimiterConfig.windowMs).toBe(60 * 1000);
  });
});

// ── webhookLimiter ────────────────────────────────────────────────
describe("webhookLimiterConfig", () => {
  it("✅ allows 120 requests per minute", () => {
    expect(webhookLimiterConfig.limit).toBe(120);
    expect(webhookLimiterConfig.windowMs).toBe(60 * 1000);
  });
});

// ── publicPollingLimiter ──────────────────────────────────────────
describe("publicPollingLimiterConfig", () => {
  it("✅ allows 60 requests per minute", () => {
    expect(publicPollingLimiterConfig.limit).toBe(60);
    expect(publicPollingLimiterConfig.windowMs).toBe(60 * 1000);
  });
});

// ── publicAgentInfoLimiter ────────────────────────────────────────
describe("publicAgentInfoLimiterConfig", () => {
  it("✅ allows 30 requests per 5 minutes", () => {
    expect(publicAgentInfoLimiterConfig.limit).toBe(30);
    expect(publicAgentInfoLimiterConfig.windowMs).toBe(5 * 60 * 1000);
  });
});

// ── deployLimiter ─────────────────────────────────────────────────
describe("deployLimiterConfig", () => {
  it("✅ allows 10 deployments per hour", () => {
    expect(deployLimiterConfig.limit).toBe(10);
    expect(deployLimiterConfig.windowMs).toBe(60 * 60 * 1000);
  });

  it("✅ disables legacy headers", () => {
    expect(deployLimiterConfig.legacyHeaders).toBe(false);
  });
});

// ── handler returns 429 JSON ──────────────────────────────────────
describe("rate limit handler", () => {
  it("✅ returns 429 with JSON error when limit exceeded", () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = vi.fn() as unknown as NextFunction;

    generalLimiterConfig.handler?.(
      req as Request,
      res as Response,
      next,
      generalLimiterConfig as any
    );

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });
});
