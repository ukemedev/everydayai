// ─── errorHandler.test.ts ────────────────────────────────────────
// TDD TESTS for global error handler middleware
//
// WHY these exist:
// → Every error type is handled consistently — forever sealed
// → Stack traces NEVER reach users in production
// → Every error is logged with request ID
// → Response is always JSON — never HTML
// → 500 is default for unknown errors
//
// SEALED FOREVER:
// → Generic Error in production → 500 + "Internal server error" ✅
// → AppError → correct status code + message ✅
// → Stack trace hidden in production ✅
// → requestId always in response ✅
// → Headers already sent → skip response ✅
// → Generic error message hidden in production ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { errorHandler, AppError } from "../middlewares/errorHandler";

// ── Restore all stubbed env vars after each test ─────────────────
afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Mock factory helpers ──────────────────────────────────────────

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    id: "req-test-123",
    method: "GET",
    url: "/api/test",
    ip: "127.0.0.1",
    ...overrides,
  };
}

function makeMockRes(overrides: Partial<Response> = {}): Partial<Response> {
  return {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

function makeMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── AppError class tests ──────────────────────────────────────────

describe("AppError", () => {

  it("✅ creates error with correct status code and message", () => {
    const err = new AppError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err).toBeInstanceOf(Error);
  });

  it("✅ isOperational is true by default", () => {
    const err = new AppError(400, "Bad request");
    expect(err.isOperational).toBe(true);
  });

  it("✅ captures stack trace", () => {
    const err = new AppError(500, "Server error");
    expect(err.stack).toBeDefined();
  });

});

// ── errorHandler middleware tests ─────────────────────────────────

describe("errorHandler middleware", () => {

  it("✅ returns 500 and hides message for generic Error in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const err = new Error("Something broke");
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        statusCode: 500,
        message: "Internal server error",
      })
    );
  });

  it("✅ returns correct status code and message for AppError", () => {
    const err = new AppError(404, "Agent not found");
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: "Agent not found",
      })
    );
  });

  it("✅ includes requestId in every response", () => {
    const err = new AppError(400, "Bad input");
    const req = makeMockReq({ id: "req-unique-456" });
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-unique-456",
      })
    );
  });

  it("❌ never exposes stack trace in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const err = new Error("DB connection failed");
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.stack).toBeUndefined();
  });

  it("✅ exposes stack trace in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    const err = new Error("Some dev error");
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.stack).toBeDefined();
  });

  it("✅ skips response if headers already sent", () => {
    const err = new Error("Too late");
    const req = makeMockReq();
    const res = makeMockRes({ headersSent: true });
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });

  it("✅ hides internal message for generic errors in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const err = new Error("TypeError: cannot read property of undefined");
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    errorHandler(err, req as Request, res as Response, next);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.message).toBe("Internal server error");
  });

});
