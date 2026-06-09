// ─── errorHandler.ts ─────────────────────────────────────────────
// Global error handler middleware
//
// WHY this exists:
// → One place handles ALL errors in the entire app
// → Stack traces NEVER reach users in production
// → Every error response is consistent JSON
// → Every error is logged with request ID for tracing
// → App never crashes silently
//
// HOW TO USE:
// → Add as the LAST middleware in app.ts
// → app.use(errorHandler)
//
// HOW TO THROW ERRORS FROM ROUTES:
// → throw new AppError(404, "Agent not found")
// → Express 5 catches it automatically — no try/catch needed
// ─────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// ── AppError ──────────────────────────────────────────────────────
// Use this class everywhere in the app to throw known errors.
// isOperational = true means it's a user-facing error (400, 404 etc)
// isOperational = false means it's a programming bug (500)
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Captures where the error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Error response shape ──────────────────────────────────────────
interface ErrorResponse {
  status: "error";
  statusCode: number;
  message: string;
  requestId: string | undefined;
  stack?: string;
}

// ── isAppError ────────────────────────────────────────────────────
function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

// ── errorHandler ─────────────────────────────────────────────────
// MUST have exactly 4 parameters — Express identifies error
// handlers by their arity (number of arguments).
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If headers already sent — delegate to Express default handler
  // Sending again would cause a crash
  if (res.headersSent) {
    next(err);
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";

  // ── Determine status code and message ──────────────────────────
  let statusCode = 500;
  let message = "Internal server error";
  let isOperational = false;

  if (isAppError(err)) {
    statusCode = err.statusCode;
    isOperational = err.isOperational;
    // Only show real message if it's an operational error
    // or we are not in production
    message =
      isOperational || !isProduction ? err.message : "Internal server error";
  } else if (err instanceof Error) {
    // Generic Error — hide message in production
    message = isProduction ? "Internal server error" : err.message;
  }

  // ── Log the error ───────────────────────────────────────────────
  // Operational errors (404, 400 etc) are warnings — not bugs
  // Programming errors (500) are real problems — log as error
  const logPayload = {
    err,
    statusCode,
    requestId: req.id?.toString(),
    method: req.method,
    url: req.url,
    ip: req.ip,
  };

  if (statusCode >= 500) {
    logger.error(logPayload, "Server error");
  } else {
    logger.warn(logPayload, "Client error");
  }

  // ── Build response ──────────────────────────────────────────────
  const response: ErrorResponse = {
    status: "error",
    statusCode,
    message,
    requestId: req.id?.toString(),
    // Stack trace only in development — never in production
    ...(!isProduction &&
      err instanceof Error && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
}
