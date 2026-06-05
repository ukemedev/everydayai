// ─── IKeyRepository.ts ────────────────────────────────────────────
// PORT (Contract)
//
// WHY this exists:
// → KeyResolutionService never talks to Supabase directly
// → It talks to this contract instead
// → Tests use a fake version (no real database needed)
// → Production uses SupabaseKeyRepository
// → If we switch database tomorrow → only adapter changes
// → This contract stays the same forever
// ──────────────────────────────────────────────────────────────────

export interface IKeyRepository {
  /**
   * Fetch and decrypt the API key for a user + provider.
   *
   * @param userId   - The authenticated user's ID
   * @param provider - "openai" | "anthropic" | "google" | "groq"
   * @returns        - Decrypted API key string, or "" if not found
   *
   * NEVER throws — returns "" on any failure.
   * Caller must check if empty before using.
   */
  getKey(userId: string, provider: string): Promise<string>;
}
