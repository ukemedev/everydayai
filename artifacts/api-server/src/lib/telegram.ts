import { logger } from "./logger.js";

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
