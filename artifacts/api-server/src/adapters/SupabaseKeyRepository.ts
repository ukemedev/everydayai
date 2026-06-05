// ─── SupabaseKeyRepository.ts ─────────────────────────────────────
// ADAPTER (Real Worker)
//
// WHY this exists:
// → This is the REAL implementation of IKeyRepository
// → It actually talks to Supabase api_keys table
// → Decrypts the stored key before returning it
// → If anything fails → returns "" (never throws)
//
// TABLE: api_keys
// COLUMNS USED: user_id, provider, api_key
// ENCRYPTION: AES-256-CBC (ivHex:dataHex format)
// ──────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { IKeyRepository } from "../ports/IKeyRepository.js";
import { decrypt, isEncrypted } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

export class SupabaseKeyRepository implements IKeyRepository {

  constructor(
    // Supabase client injected in — not created here
    // This makes testing easy (inject fake client)
    private sb: ReturnType<typeof createClient>
  ) {}

  async getKey(userId: string, provider: string): Promise<string> {
    try {
      // Step 1: Query api_keys table for this user + provider
      const { data, error } = await this.sb
        .from("api_keys")
        .select("api_key")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle(); // returns null if not found (no error)

      if (error) {
        logger.error({ error, userId, provider }, "SupabaseKeyRepository: DB error fetching key");
        return ""; // non-fatal — caller handles empty string
      }

      if (!data?.api_key) {
        // No key saved for this provider yet
        logger.info({ userId, provider }, "SupabaseKeyRepository: no key found");
        return "";
      }

      const raw = data.api_key as string;

      // Step 2: Decrypt if encrypted (all keys should be encrypted)
      // isEncrypted checks: 2 parts separated by ":", first part = 32 chars
      if (isEncrypted(raw)) {
        const decrypted = decrypt(raw);
        if (!decrypted) {
          // decrypt() returned "" — key is corrupted
          logger.error({ userId, provider }, "SupabaseKeyRepository: decryption returned empty");
          return "";
        }
        return decrypted;
      }

      // Key exists but not encrypted (legacy plaintext key)
      // Return as-is — migrateUnencryptedKeys() will fix it on next startup
      logger.warn({ userId, provider }, "SupabaseKeyRepository: returning unencrypted key");
      return raw;

    } catch (err) {
      // Catch-all — never let this throw up the chain
      logger.error({ err, userId, provider }, "SupabaseKeyRepository: unexpected error");
      return "";
    }
  }
}
