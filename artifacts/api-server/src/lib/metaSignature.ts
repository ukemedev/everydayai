import crypto from "crypto";
import type { Request } from "express";

// ─── HMAC-SHA256 webhook signature verification ───────────────────────────────
// Meta signs every webhook POST body with the App Secret and sends the result
// in the X-Hub-Signature-256 header as "sha256=<hex>".
// We verify it using timingSafeEqual to prevent timing attacks.

export function verifyMetaSignature(
  req: Request,
  appSecret: string
): boolean {
  const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!rawBody || !signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
