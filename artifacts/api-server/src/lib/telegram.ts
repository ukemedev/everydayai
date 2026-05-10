import { logger } from "./logger.js";

// ── sendTelegramAlert (DevBot monitoring) ─────────────────────────────────────
// Uses DEVBOT_TELEGRAM_TOKEN + DEVBOT_TELEGRAM_CHAT_ID from environment.
// Never throws — all errors are suppressed so alerts never crash the server.

export interface TelegramAlert {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

const SEVERITY_EMOJI: Record<string, string> = {
  info:     "ℹ️",
  warning:  "⚠️",
  critical: "🔴",
};

export function devbotTelegramConfigured(): boolean {
  return !!(process.env.DEVBOT_TELEGRAM_TOKEN && process.env.DEVBOT_TELEGRAM_CHAT_ID);
}

export async function sendTelegramAlert(alert: TelegramAlert): Promise<void> {
  try {
    const token  = process.env.DEVBOT_TELEGRAM_TOKEN;
    const chatId = process.env.DEVBOT_TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    const emoji = SEVERITY_EMOJI[alert.severity] ?? "📢";
    const text = [
      `${emoji} *${alert.title}*`,
      "",
      alert.message,
      "",
      `_Severity: ${alert.severity}_`,
      `_${new Date().toISOString()}_`,
    ].join("\n");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "DevBot Telegram alert failed");
    }
  } catch (err) {
    // Never throw
    logger.warn({ err }, "sendTelegramAlert error (suppressed)");
  }
}

// ── sendTelegramMessage (existing user-facing integration) ────────────────────

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });

    const json = (await res.json()) as { ok: boolean; description?: string };

    if (!res.ok || !json.ok) {
      const errMsg = json.description ?? `HTTP ${res.status}`;
      logger.warn({ chatId, errMsg }, "Telegram sendMessage failed");
      return { success: false, error: errMsg };
    }

    logger.info({ chatId }, "Telegram message sent successfully");
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Telegram sendMessage threw");
    return { success: false, error: errMsg };
  }
}
