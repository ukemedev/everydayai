import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServiceClient } from "../lib/supabaseService.js";
import { getProviderForModel } from "../lib/aiDispatch.js";

// ── supabaseService.getServiceClient() ───────────────────────────

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
    process.env.VITE_SUPABASE_URL         = ORIG_VITE;
    process.env.SUPABASE_URL              = ORIG_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG_KEY;
  });

  it("returns a client when VITE_SUPABASE_URL is set", () => {
    process.env.VITE_SUPABASE_URL         = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).not.toBeNull();
  });

  it("returns a client when SUPABASE_URL is set (fallback)", () => {
    process.env.SUPABASE_URL              = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getServiceClient()).not.toBeNull();
  });

  it("returns a client when both env names are set", () => {
    process.env.VITE_SUPABASE_URL         = "https://primary.supabase.co";
    process.env.SUPABASE_URL              = "https://fallback.supabase.co";
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

// ── aiDispatch.getProviderForModel() ─────────────────────────────

describe("aiDispatch.getProviderForModel()", () => {
  it("defaults to openai for gpt models and unknowns", () => {
    expect(getProviderForModel("gpt-4o")).toBe("openai");
    expect(getProviderForModel("gpt-4o-mini")).toBe("openai");
    expect(getProviderForModel("unknown-model")).toBe("openai");
  });

  it("routes llama/mixtral/whisper to groq (temporary — testing only)", () => {
    expect(getProviderForModel("llama3-70b-8192")).toBe("groq");
    expect(getProviderForModel("mixtral-8x7b-32768")).toBe("groq");
    expect(getProviderForModel("whisper-large-v3")).toBe("groq");
  });
});

// ── Source-code guards ────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readRoute(name: string): string {
  return readFileSync(resolve(process.cwd(), `src/routes/${name}.ts`), "utf-8");
}

describe("source-code sealed guards", () => {
  it("whatsapp.ts must NOT contain an empty caps object", () => {
    const src = readRoute("whatsapp");
    expect(src).not.toMatch(/const caps.*=.*\{\s*\}/);
  });

  it("whatsapp.ts must import getServiceClient from supabaseService", () => {
    const src = readRoute("whatsapp");
    expect(src).toContain('from "../lib/supabaseService.js"');
  });

  it("no channel route should define a local getServiceClient function", () => {
    const src = readRoute("whatsapp");
    expect(src).not.toContain("function getServiceClient()");
  });
});