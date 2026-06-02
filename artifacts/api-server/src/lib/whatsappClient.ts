import { logger } from "./logger.js";

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    logger.error({ to, phoneNumberId, status: res.status, errBody }, "WhatsApp API send failed");
    throw new Error(`WhatsApp API error ${res.status}: ${errBody}`);
  }
}
