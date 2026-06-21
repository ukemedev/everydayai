// ─── KeyResolutionService.test.ts ─────────────────────────────────
// TDD TESTS
//
// WHY these exist:
// → Every critical path is proven to work
// → If anyone changes code and breaks these → test screams
// → No real Supabase needed — fake adapters used
// → Tests run in milliseconds
//
// WHAT IS SEALED FOREVER:
// → Draft agent works in studio ✅
// → Wrong user cannot access agent ✅
// → Missing API key returns clear error ✅
// → Public cannot access draft agent ✅
// → Owner's key used for public widget ✅
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  KeyResolutionService,
  getProviderForModel,
} from "../services/KeyResolutionService.js";
import type { IKeyRepository } from "../ports/IKeyRepository.js";
import type { IAgentRepository, Agent } from "../ports/IAgentRepository.js";

// ── FAKE ADAPTERS ─────────────────────────────────────────────────
// These pretend to be Supabase without connecting to anything.
// Fast. Reliable. No network needed.

function makeFakeKeyRepo(keys: Record<string, string>): IKeyRepository {
  return {
    // key format: "userId:provider" → decrypted key
    getKey: async (userId, provider) =>
      keys[`${userId}:${provider}`] ?? "",
  };
}

function makeFakeAgentRepo(agents: Agent[]): IAgentRepository {
  return {
    // findByOwner: match agentId AND userId — no status filter
    findByOwner: async (agentId, userId) =>
      agents.find(a => a.id === agentId && a.user_id === userId) ?? null,

    // findLive: match agentId AND status must be "live"
    findLive: async (agentId) =>
      agents.find(a => a.id === agentId && a.status === "live") ?? null,
  };
}

// ── HELPER: getProviderForModel ───────────────────────────────────

describe("getProviderForModel", () => {

  it("returns openai for gpt models and anything not matching groq patterns", () => {
    expect(getProviderForModel("gpt-4o")).toBe("openai");
    expect(getProviderForModel("gpt-4o-mini")).toBe("openai");
    expect(getProviderForModel("gpt-3.5-turbo")).toBe("openai");
    expect(getProviderForModel("claude-3-haiku-20240307")).toBe("openai");
  });

  it("returns groq for llama/mixtral/whisper models (TEMPORARY testing exception)", () => {
    expect(getProviderForModel("llama-3.3-70b-versatile")).toBe("groq");
    expect(getProviderForModel("mixtral-8x7b-32768")).toBe("groq");
    expect(getProviderForModel("whisper-large-v3")).toBe("groq");
  });
});

// ── STRATEGY A: resolveForStudio ─────────────────────────────────

describe("KeyResolutionService.resolveForStudio", () => {

  it("✅ THE CORE FIX: owner can test a DRAFT agent", async () => {
    // This is the exact bug that was broken before
    // Draft agent must work in studio — forever sealed
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "user-1:openai": "sk-real-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "user-1",
          model: "gpt-4o-mini",
          instructions: "Help customers",
          status: "draft", // ← was silently blocked before
        },
      ])
    );

    const result = await service.resolveForStudio(
      "user-1", "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({
      ok: true,
      apiKey: "sk-real-key",
      ownerId: "user-1",
      provider: "openai",
    });
  });

  it("✅ owner can test a LIVE agent", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "user-1:openai": "sk-real-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "user-1",
          model: "gpt-4o-mini",
          instructions: "Help customers",
          status: "live",
        },
      ])
    );

    const result = await service.resolveForStudio(
      "user-1", "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({ ok: true, apiKey: "sk-real-key" });
  });

  it("✅ owner can test a TESTING status agent", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "user-1:groq": "sk-groq-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "user-1",
          model: "llama-3.3-70b-versatile",
          instructions: "Help customers",
          status: "testing",
        },
      ])
    );

    const result = await service.resolveForStudio(
      "user-1", "agent-1", "", "llama-3.3-70b-versatile", "fallback"
    );

    expect(result).toMatchObject({
      ok: true,
      apiKey: "sk-groq-key",
      provider: "groq",
    });
  });

  it("❌ wrong user cannot access another user's agent", async () => {
    // Security: hacker trying to test someone else's agent
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "hacker:openai": "sk-hacker-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "owner-1", // belongs to owner-1
          model: "gpt-4o-mini",
          instructions: "Help",
          status: "live",
        },
      ])
    );

    const result = await service.resolveForStudio(
      "hacker", "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toEqual({ ok: false, reason: "NOT_OWNER" });
  });

  it("❌ returns NO_API_KEY when owner has not saved key yet", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({}), // no keys saved
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "user-1",
          model: "gpt-4o-mini",
          instructions: "Help",
          status: "draft",
        },
      ])
    );

    const result = await service.resolveForStudio(
      "user-1", "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "NO_API_KEY",
      provider: "openai",
    });
  });

  it("❌ returns NOT_OWNER for non-existent agent", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "user-1:openai": "sk-key" }),
      makeFakeAgentRepo([]) // no agents
    );

    const result = await service.resolveForStudio(
      "user-1", "wrong-agent-id", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toEqual({ ok: false, reason: "NOT_OWNER" });
  });
});

// ── STRATEGY B: resolveForPublic ─────────────────────────────────

describe("KeyResolutionService.resolveForPublic", () => {

  it("✅ resolves live agent using owner's key", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "owner-1:openai": "sk-owner-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "owner-1",
          model: "gpt-4o-mini",
          instructions: "Help customers",
          status: "live",
        },
      ])
    );

    const result = await service.resolveForPublic(
      "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({
      ok: true,
      apiKey: "sk-owner-key",
      ownerId: "owner-1",
    });
  });

  it("❌ draft agent is NOT accessible to public", async () => {
    // Public visitors must never see draft agents
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "owner-1:openai": "sk-key" }),
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "owner-1",
          model: "gpt-4o-mini",
          instructions: "Help",
          status: "draft", // ← public cannot access this
        },
      ])
    );

    const result = await service.resolveForPublic(
      "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toEqual({ ok: false, reason: "AGENT_NOT_FOUND" });
  });

  it("❌ returns AGENT_NOT_FOUND for wrong agent ID", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({}),
      makeFakeAgentRepo([])
    );

    const result = await service.resolveForPublic(
      "wrong-id", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toEqual({ ok: false, reason: "AGENT_NOT_FOUND" });
  });

  it("❌ returns NO_API_KEY when owner forgot to save key", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({}), // owner has no key
      makeFakeAgentRepo([
        {
          id: "agent-1",
          user_id: "owner-1",
          model: "gpt-4o-mini",
          instructions: "Help",
          status: "live",
        },
      ])
    );

    const result = await service.resolveForPublic(
      "agent-1", "", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "NO_API_KEY",
      provider: "openai",
    });
  });
});

// ── STRATEGY C: resolveForDirect ─────────────────────────────────

describe("KeyResolutionService.resolveForDirect", () => {

  it("✅ resolves key for direct API call", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({ "user-1:openai": "sk-direct" }),
      makeFakeAgentRepo([])
    );

    const result = await service.resolveForDirect(
      "user-1", "openai", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({ ok: true, apiKey: "sk-direct" });
  });

  it("❌ returns NO_API_KEY when no key saved", async () => {
    const service = new KeyResolutionService(
      makeFakeKeyRepo({}),
      makeFakeAgentRepo([])
    );

    const result = await service.resolveForDirect(
      "user-1", "openai", "gpt-4o-mini", "fallback"
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "NO_API_KEY",
      provider: "openai",
    });
  });
});