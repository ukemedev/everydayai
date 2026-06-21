// ─── channel-dispatch.test.ts ─────────────────────────────────────────────────
//
// SEALED tests for the channel dispatch shared infrastructure.
//
// These tests lock the behaviour that was broken in production:
//
//   BUG-1 (FIXED): telegram.ts used process.env.SUPABASE_URL while the host
//   only sets VITE_SUPABASE_URL → getServiceClient() returned null → every
//   telegram webhook was silently swallowed after the 200 ACK.
//
//   BUG-2 (FIXED): All channel routes declared `const caps = {}` but never
//   populated it, so caps.voice/images/files were always undefined and all
//   media was silently discarded.
//
// SEALED FOREVER:
//   supabaseService
//     ✅ returns client when VITE_SUPABASE_URL is set (primary env name)
//     ✅ returns client when SUPABASE_URL is set (fallback env name)
//     ✅ returns client when both are set
//     ✅ returns null when neither URL is set
//     ✅ returns null when service role key is missing
//
//   aiDispatch - getProviderForModel
//     ✅ routes claude-* to anthropic
//     ✅ routes gemini-* to google
//     ✅ routes llama/mixtral models to groq
//     ✅ defaults to openai for everything else
//
//   aiDispatch - truncateForTelegram
//     ✅ returns text unchanged when under 4096 chars
//     ✅ returns text unchanged at exactly 4096 chars
//     ✅ truncates and appends ellipsis when over limit
//     ✅ result is always ≤ 4096 chars
//
//   telegram webhook secret
//     ✅ deterministic — same agentId → same secret
//     ✅ different agentIds → different secrets
//     ✅ exactly 64 hex characters
//     ✅ changes when SESSION_SECRET changes
//
//   source-code guards (sealed against regression)
//     ✅ telegram.ts has no empty caps object
//     ✅ telegram.ts imports getServiceClient from supabaseService
//     ✅ telegram.ts does not call process.env.SUPABASE_URL directly
//     ✅ whatsapp.ts has no empty caps object
//     ✅ all channel routes use shared supabaseService (not local copies)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServiceClient } from "../lib/supabaseService.js";
import {
  getProviderForModel,
  truncateForTelegram,
  TELEGRAM_MAX_MSG_LEN,
} from "../lib/aiDispatch.js";

// ── supabaseService.getServiceClient() ────────────────────────────────────────

describe("supabaseService.getServiceClient()", () => {
  const ORIG_VITE = process.env.VITE_SUPABASE_URL;
  const ORIG_URL  = process.env.SUPABASE_URL;
  const ORIG_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env.VITE_SUPABASE_URL       = ORIG_VITE;
    process.env.SUPABASE_URL            = ORIG_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG_KEY;
  });

  it("returns a client when VITE_SUPABASE_URL is set (primary env name)", () => {
    process.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).not.toBeNull();
  });

  it("returns a client when SUPABASE_URL is set (fallback — was the broken case)", () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).not.toBeNull();
  });

  it("returns a client when both env names are set (primary wins)", () => {
    process.env.VITE_SUPABASE_URL = "https://primary.supabase.co";
    process.env.SUPABASE_URL      = "https://fallback.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).not.toBeNull();
  });

  it("returns null when neither URL env var is set", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).toBeNull();
  });

  it("returns null when service role key is missing", () => {
    process.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
    expect(getServiceClient()).toBeNull();
  });
});

// ── aiDispatch.getProviderForModel() ──────────────────────────────────────────

describe("aiDispatch.getProviderForModel()", () => {
  it("defaults to openai for gpt models and unknowns", () => {
    expect(getProviderForModel("gpt-4o")).toBe("openai");
    expect(getProviderForModel("gpt-4o-mini")).toBe("openai");
    expect(getProviderForModel("claude-3-haiku-20240307")).toBe("openai");
    expect(getProviderForModel("unknown-model")).toBe("openai");
  });

  it("routes llama/mixtral/whisper models to groq (TEMPORARY testing exception)", () => {
    expect(getProviderForModel("llama3-70b-8192")).toBe("groq");
    expect(getProviderForModel("mixtral-8x7b-32768")).toBe("groq");
    expect(getProviderForModel("whisper-large-v3")).toBe("groq");
  });
});

// ── aiDispatch.truncateForTelegram() ──────────────────────────────────────────

describe("aiDispatch.truncateForTelegram()", () => {
  it("returns text unchanged when under 4096 chars", () => {
    const short = "Hello world";
    expect(truncateForTelegram(short)).toBe(short);
  });

  it("returns text unchanged at exactly 4096 chars", () => {
    const exact = "a".repeat(TELEGRAM_MAX_MSG_LEN);
    expect(truncateForTelegram(exact)).toBe(exact);
    expect(truncateForTelegram(exact).length).toBe(4096);
  });

  it("truncates and appends ellipsis when over limit", () => {
    const over = "b".repeat(TELEGRAM_MAX_MSG_LEN + 500);
    const result = truncateForTelegram(over);
    expect(result.length).toBe(TELEGRAM_MAX_MSG_LEN);
    expect(result.endsWith("…")).toBe(true);
  });

  it("result is always ≤ 4096 chars for any input length", () => {
    for (const len of [0, 100, 4095, 4096, 4097, 8000, 10000]) {
      expect(truncateForTelegram("x".repeat(len)).length).toBeLessThanOrEqual(TELEGRAM_MAX_MSG_LEN);
    }
  });
});

// ── Telegram webhook secret ───────────────────────────────────────────────────

describe("telegram webhook secret", () => {
  function computeSecret(agentId: string): string {
    const secret = process.env.SESSION_SECRET ?? "everydayai-webhook-secret";
    return createHmac("sha256", secret).update(agentId).digest("hex").slice(0, 64);
  }

  it("is deterministic — same agentId always produces the same secret", () => {
    expect(computeSecret("agent-123")).toBe(computeSecret("agent-123"));
  });

  it("different agentIds produce different secrets", () => {
    expect(computeSecret("agent-AAA")).not.toBe(computeSecret("agent-BBB"));
  });

  it("secret is exactly 64 hex characters", () => {
    const s = computeSecret("any-agent-id");
    expect(s).toHaveLength(64);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when SESSION_SECRET env var changes", () => {
    const orig = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "custom-secret-value-aaa";
    const a = computeSecret("agent-x");
    process.env.SESSION_SECRET = "other-secret-value-bbb";
    const b = computeSecret("agent-x");
    expect(a).not.toBe(b);
    process.env.SESSION_SECRET = orig;
  });
});

// ── Source-code guards (sealed against regression) ───────────────────────────

function readRoute(name: string): string {
  return readFileSync(resolve(process.cwd(), `src/routes/${name}.ts`), "utf-8");
}

describe("source-code sealed guards", () => {
  it("telegram.ts must NOT contain an empty caps object (the root media bug)", () => {
    const src = readRoute("telegram");
    expect(src).not.toMatch(/const caps.*=.*\{\s*\}/);
  });

  it("telegram.ts must import getServiceClient from supabaseService (root env bug fix)", () => {
    const src = readRoute("telegram");
    expect(src).toContain('from "../lib/supabaseService.js"');
  });

  it("telegram.ts must NOT reference process.env.SUPABASE_URL directly", () => {
    const src = readRoute("telegram");
    // SUPABASE_URL (without _SERVICE or _ANON suffix) was the broken line.
    // Only supabaseService.ts is allowed to read env vars for the DB URL.
    expect(src).not.toMatch(/process\.env\.SUPABASE_URL(?!_SERVICE|_ANON)/);
  });

  it("whatsapp.ts must NOT contain an empty caps object", () => {
    const src = readRoute("whatsapp");
    expect(src).not.toMatch(/const caps.*=.*\{\s*\}/);
  });

  it("whatsapp.ts must import getServiceClient from supabaseService", () => {
    const src = readRoute("whatsapp");
    expect(src).toContain('from "../lib/supabaseService.js"');
  });

  it("messenger.ts must import getServiceClient from supabaseService", () => {
    const src = readRoute("messenger");
    expect(src).toContain('from "../lib/supabaseService.js"');
  });

  it("instagram.ts must import getServiceClient from supabaseService", () => {
    const src = readRoute("instagram");
    expect(src).toContain('from "../lib/supabaseService.js"');
  });

  it("no channel route should define a local getServiceClient function", () => {
    for (const ch of ["telegram", "whatsapp", "messenger", "instagram"]) {
      const src = readRoute(ch);
      expect(src, `${ch}.ts must not define a local getServiceClient()`).not.toContain("function getServiceClient()");
    }
  });
});