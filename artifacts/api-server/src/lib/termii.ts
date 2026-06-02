import { logger } from "./logger.js";

interface TermiiResponse {
  code?: string;
  message_id?: string;
  message?: string;
  balance?: number;
}

export async function sendTermiiSms(
  apiKey: string,
  senderId: string,
  to: string,
  sms: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        to,
        from: senderId,
        sms,
        type: "plain",
        channel: "generic",
      }),
    });

    const data = (await res.json()) as TermiiResponse;

    if (!res.ok || data.code === "404") {
      const errMsg = data.message ?? `Termii API returned ${res.status}`;
      logger.error({ status: res.status, to }, "Termii SMS failed");
      return { success: false, error: errMsg };
    }

    logger.info({ to, messageId: data.message_id }, "Termii SMS sent");
    return { success: true, messageId: data.message_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, to }, "Termii SMS threw");
    return { success: false, error: msg };
  }
}
