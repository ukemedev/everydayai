import { createClient } from "@supabase/supabase-js";
import { sendTelegramAlert, devbotTelegramConfigured } from "./telegram.js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ErrorEntry {
  action: string;
  count: number;
}

export interface HealthCheckResult {
  status: "ok" | "warning" | "critical";
  errorCount: number;
  errors: ErrorEntry[];
  warnings: string[];
  lastChecked: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const WARNING_THRESHOLD  = 5;
const CRITICAL_THRESHOLD = 15;
const WINDOW_MINUTES     = 30;

// ── Module-level state ────────────────────────────────────────────────────────

let lastResult: HealthCheckResult | null = null;
let alertSentAt: number | null = null;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // Don't spam — at most one alert per window

export function getLastHealthResult(): HealthCheckResult | null {
  return lastResult;
}

// ── runHealthCheck ────────────────────────────────────────────────────────────

export async function runHealthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    status:      "ok",
    errorCount:  0,
    errors:      [],
    warnings:    [],
    lastChecked: new Date().toISOString(),
  };

  try {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      result.warnings.push("Supabase not configured — health check skipped");
      lastResult = result;
      return result;
    }

    const sb    = createClient(url, key, { auth: { persistSession: false } });
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    // Look for audit log entries whose action suggests failure/error
    const { data, error } = await sb
      .from("audit_logs")
      .select("action, created_at")
      .gte("created_at", since)
      .or("action.ilike.%error%,action.ilike.%fail%,action.ilike.%exception%,action.ilike.%denied%");

    if (error) {
      result.warnings.push(`Could not query audit logs: ${error.message}`);
      lastResult = result;
      return result;
    }

    // Group by action
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { action: string }[]) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }

    result.errors     = [...counts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
    result.errorCount = (data ?? []).length;

    if (result.errorCount >= CRITICAL_THRESHOLD) {
      result.status = "critical";
    } else if (result.errorCount >= WARNING_THRESHOLD) {
      result.status = "warning";
    }

    // Send Telegram alert — max once per cooldown window
    const now = Date.now();
    const canAlert = !alertSentAt || (now - alertSentAt) >= ALERT_COOLDOWN_MS;

    if (result.status !== "ok" && devbotTelegramConfigured() && canAlert) {
      alertSentAt = now;
      const summary = result.errors
        .slice(0, 8)
        .map((e) => `• ${e.action}: ${e.count}`)
        .join("\n");

      await sendTelegramAlert({
        title:    "EverydayAI Health Alert",
        message:  `${result.errorCount} error-related event(s) detected in the last ${WINDOW_MINUTES} minutes.\n\n${summary}`,
        severity: result.status,
      });

      logger.warn({ errorCount: result.errorCount, status: result.status }, "health alert sent");
    }

    logger.info(
      { status: result.status, errorCount: result.errorCount },
      "health check completed"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.warnings.push(`Health check threw: ${msg}`);
    logger.error({ err }, "health check failed");
  }

  lastResult = result;
  return result;
}

// ── startMonitor ──────────────────────────────────────────────────────────────
// Call once at server boot. Runs an immediate check then repeats every 30 min.

export function startMonitor(): void {
  // Initial check — delayed 5 s so the server is fully up
  setTimeout(() => {
    runHealthCheck().catch((err) =>
      logger.error({ err }, "initial health check failed")
    );
  }, 5_000);

  setInterval(() => {
    runHealthCheck().catch((err) =>
      logger.error({ err }, "scheduled health check failed")
    );
  }, WINDOW_MINUTES * 60 * 1_000);

  logger.info({ intervalMinutes: WINDOW_MINUTES }, "error monitor started");
}
