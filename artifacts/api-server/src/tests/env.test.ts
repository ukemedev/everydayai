// ─── env.test.ts ─────────────────────────────────────────────────
// TDD TESTS for environment variable validator
//
// WHY these exist:
// → App must REFUSE to start if any secret is missing
// → Clear error messages — not mysterious crashes
// → Sealed forever — nobody can accidentally remove validation
//
// WHAT IS SEALED FOREVER:
// → Missing DATABASE_URL → fails ✅
// → Invalid DATABASE_URL → fails ✅
// → Short SESSION_SECRET → fails ✅
// → Wrong NODE_ENV value → fails ✅
// → Invalid SUPABASE_URL → fails ✅
// → All valid → passes ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { validateEnv } from "../config/env.js";

// ── Valid base config — used in passing tests ─────────────────────
const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
  SESSION_SECRET: "this-is-a-fake-secret-32-chars-min",
  VITE_SUPABASE_URL: "https://fake.supabase.co",
  VITE_SUPABASE_ANON_KEY: "fake-anon-key-for-testing-only",
  PORT: "3000",
};

describe("validateEnv", () => {

  it("✅ passes when all required variables are valid", () => {
    const result = validateEnv(validEnv);
    expect(result.success).toBe(true);
  });

  it("✅ PORT is coerced to a number", () => {
    const result = validateEnv(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.PORT).toBe("number");
      expect(result.data.PORT).toBe(3000);
    }
  });

  it("❌ fails when DATABASE_URL is missing", () => {
    const { DATABASE_URL, ...rest } = validEnv;
    const result = validateEnv(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("DATABASE_URL");
    }
  });

  it("❌ fails when DATABASE_URL is not a valid URL", () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("DATABASE_URL");
    }
  });

  it("❌ fails when SESSION_SECRET is shorter than 32 characters", () => {
    const result = validateEnv({ ...validEnv, SESSION_SECRET: "tooshort" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("SESSION_SECRET");
    }
  });

  it("❌ fails when NODE_ENV is an invalid value", () => {
    const result = validateEnv({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("NODE_ENV");
    }
  });

  it("❌ fails when VITE_SUPABASE_URL is not a valid URL", () => {
    const result = validateEnv({ ...validEnv, VITE_SUPABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("VITE_SUPABASE_URL");
    }
  });

  it("❌ fails when VITE_SUPABASE_ANON_KEY is missing", () => {
    const { VITE_SUPABASE_ANON_KEY, ...rest } = validEnv;
    const result = validateEnv(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("VITE_SUPABASE_ANON_KEY");
    }
  });

});
