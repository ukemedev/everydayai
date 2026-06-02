import { logger } from "./logger.js";

export interface HealthResult {
  ok: boolean;
  timestamp: string;
  checks: Record<string, { ok: boolean; message?: string }>;
}

let lastResult: HealthResult | null = null;

export async function runHealthCheck(): Promise<HealthResult> {
  const result: HealthResult = {
    ok: true,
    timestamp: new Date().toISOString(),
    checks: {
      server: { ok: true, message: "Running" },
    },
  };
  lastResult = result;
  logger.info({ result }, "errorMonitor: health check complete");
  return result;
}

export function getLastHealthResult(): HealthResult | null {
  return lastResult;
}
