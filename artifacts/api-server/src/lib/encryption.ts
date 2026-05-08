import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger.js";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be set and exactly 32 characters");
  }
  return Buffer.from(raw, "utf8");
}

export function encrypt(text: string): string {
  const iv     = randomBytes(16);
  const key    = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  try {
    const [ivHex, dataHex] = encryptedText.split(":");
    if (!ivHex || !dataHex) return "";
    const iv       = Buffer.from(ivHex, "hex");
    const data     = Buffer.from(dataHex, "hex");
    const key      = getKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    logger.error({ err }, "Failed to decrypt value");
    return "";
  }
}

/** Returns true if the string looks like an encrypted iv:data value */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 2 && parts[0].length === 32;
}
