import { logger } from "./logger.js";

export interface CapturedError {
  id: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  resolved: boolean;
  timestamp: string;
}

const errors: CapturedError[] = [];

export function captureError(
  message: string,
  stack?: string,
  context?: Record<string, unknown>,
): CapturedError {
  const err: CapturedError = {
    id: crypto.randomUUID(),
    message,
    stack,
    context,
    resolved: false,
    timestamp: new Date().toISOString(),
  };
  errors.push(err);
  logger.warn({ id: err.id, message }, "devbotErrorCapture: error captured");
  return err;
}

export function getErrors(resolvedOnly = false): CapturedError[] {
  if (resolvedOnly) return errors.filter((e) => e.resolved);
  return errors.filter((e) => !e.resolved);
}

export function markResolved(id: string): boolean {
  const err = errors.find((e) => e.id === id);
  if (!err) return false;
  err.resolved = true;
  logger.info({ id }, "devbotErrorCapture: error marked resolved");
  return true;
}
