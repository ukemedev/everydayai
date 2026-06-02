// ─── Shared Meta Graph API send helper ───────────────────────────────────────
// Used by both Messenger and Instagram DM routes.
// The send endpoint and payload format are identical for both channels.

export async function sendMetaMessage(
  accessToken: string,
  recipientId: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message:   { text },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Graph API error ${res.status}: ${body}`);
  }
}
