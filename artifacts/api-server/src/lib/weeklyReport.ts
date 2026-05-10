import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramAlert, devbotTelegramConfigured } from "./telegram.js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyStats {
  newUsers:      number;
  newAgents:     number;
  totalMessages: number;
  revenueNaira:  number;
  bugsDetected:  number;
  weekStart:     string;
  weekEnd:       string;
  generatedAt:   string;
}

// ── Supabase client ───────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── generateWeeklyReport ──────────────────────────────────────────────────────

export async function generateWeeklyReport(): Promise<WeeklyStats> {
  const now       = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const stats: WeeklyStats = {
    newUsers:      0,
    newAgents:     0,
    totalMessages: 0,
    revenueNaira:  0,
    bugsDetected:  0,
    weekStart:     weekStart.toISOString(),
    weekEnd:       now.toISOString(),
    generatedAt:   now.toISOString(),
  };

  const sb = getServiceClient();
  if (!sb) {
    logger.warn("weekly report: Supabase not configured, returning empty stats");
    return stats;
  }

  const since = weekStart.toISOString();

  const [usersRes, agentsRes, messagesRes, paymentsRes, bugsRes] = await Promise.allSettled([
    // New users signed up this week
    sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),

    // New agents created this week
    sb
      .from("agents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),

    // Messages / chat events this week (audit_logs with message/chat actions)
    sb
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .or("action.ilike.%message%,action.ilike.%chat%,action.ilike.%send%"),

    // Revenue from successful payments this week (amounts in kobo)
    sb
      .from("payments")
      .select("amount")
      .eq("status", "success")
      .gte("created_at", since),

    // Bug/error events this week
    sb
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .or("action.ilike.%error%,action.ilike.%fail%,action.ilike.%exception%"),
  ]);

  if (usersRes.status === "fulfilled" && !usersRes.value.error) {
    stats.newUsers = usersRes.value.count ?? 0;
  }

  if (agentsRes.status === "fulfilled" && !agentsRes.value.error) {
    stats.newAgents = agentsRes.value.count ?? 0;
  }

  if (messagesRes.status === "fulfilled" && !messagesRes.value.error) {
    stats.totalMessages = messagesRes.value.count ?? 0;
  }

  if (paymentsRes.status === "fulfilled" && !paymentsRes.value.error) {
    type PayRow = { amount: number };
    const rows = (paymentsRes.value.data as PayRow[]) ?? [];
    stats.revenueNaira = rows.reduce((sum, r) => sum + r.amount, 0) / 100;
  }

  if (bugsRes.status === "fulfilled" && !bugsRes.value.error) {
    stats.bugsDetected = bugsRes.value.count ?? 0;
  }

  logger.info(
    { newUsers: stats.newUsers, newAgents: stats.newAgents, revenueNaira: stats.revenueNaira },
    "weekly report generated"
  );

  return stats;
}

// ── formatReportMessage ───────────────────────────────────────────────────────

export function formatReportMessage(stats: WeeklyStats): string {
  const start = new Date(stats.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const end   = new Date(stats.weekEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const lines = [
    `📊 *EverydayAI Weekly Report*`,
    `_${start} – ${end}_`,
    ``,
    `👥 New users: *${stats.newUsers}*`,
    `🤖 New agents created: *${stats.newAgents}*`,
    `💬 Messages sent: *${stats.totalMessages}*`,
    `💰 Revenue: *₦${stats.revenueNaira.toLocaleString("en-NG", { minimumFractionDigits: 2 })}*`,
    `🐛 Bugs / errors detected: *${stats.bugsDetected}*`,
    ``,
    `_Generated ${new Date(stats.generatedAt).toLocaleString()}_`,
  ];

  return lines.join("\n");
}

// ── sendWeeklyReportTelegram ──────────────────────────────────────────────────

export async function sendWeeklyReportTelegram(): Promise<WeeklyStats> {
  const stats = await generateWeeklyReport();

  if (!devbotTelegramConfigured()) {
    logger.warn("weekly report: Telegram not configured, skipping send");
    return stats;
  }

  const message = formatReportMessage(stats);

  await sendTelegramAlert({
    title:    "Weekly Report",
    message,
    severity: "info",
  });

  logger.info("weekly report sent to Telegram");
  return stats;
}

// ── startWeeklyReportScheduler ────────────────────────────────────────────────
// Schedules the report to fire every Sunday at 9 AM server time.

export function startWeeklyReportScheduler(): void {
  // Cron: second=0, minute=0, hour=9, day=*, month=*, weekday=0 (Sunday)
  cron.schedule("0 9 * * 0", () => {
    logger.info("weekly report cron fired");
    sendWeeklyReportTelegram().catch((err) =>
      logger.error({ err }, "weekly report cron failed")
    );
  });

  logger.info("weekly report scheduler started (Sundays at 09:00)");
}
