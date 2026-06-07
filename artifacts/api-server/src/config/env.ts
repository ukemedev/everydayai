// ─── env.ts ──────────────────────────────────────────────────────
// Environment variable validator
//
// WHY this exists:
// → App refuses to start if any required secret is missing
// → Clear error messages — not mysterious crashes
// → Every variable is typed — no raw process.env anywhere
// → Single source of truth for all configuration
//
// HOW TO USE:
// → import { env } from "./config/env.js"
// → env.DATABASE_URL  ← fully typed, guaranteed to exist
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Schema ────────────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid URL" }),

  SESSION_SECRET: z
    .string()
    .min(32, { message: "SESSION_SECRET must be at least 32 characters" }),

  VITE_SUPABASE_URL: z
    .string()
    .url({ message: "VITE_SUPABASE_URL must be a valid URL" }),

  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, { message: "VITE_SUPABASE_ANON_KEY is required" }),
});

// ── Type ──────────────────────────────────────────────────────────
export type Env = z.infer<typeof envSchema>;

// ── validateEnv — used in tests and on startup ────────────────────
// Accepts any object so tests can pass fake values safely.
// Returns { success: true, data } or { success: false, error }
export function validateEnv(input: Record<string, unknown> = process.env): 
  | { success: true; data: Env }
  | { success: false; error: string } {

  const result = envSchema.safeParse(input);

  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    return {
      success: false,
      error: `Invalid environment variables:\n${messages}`,
    };
  }

  return { success: true, data: result.data };
}

// ── env — the singleton used by the app ───────────────────────────
// This runs once on startup. If anything is wrong, app exits
// immediately with a clear error message.
function loadEnv(): Env {
  const result = validateEnv(process.env);

  if (!result.success) {
    console.error("\n❌ App cannot start — environment config is invalid:\n");
    console.error(result.error);
    console.error("\nFix your .env file and restart the server.\n");
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
