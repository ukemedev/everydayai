// ─── KeyResolutionService.ts ──────────────────────────────────────
// SERVICE (Business Logic)
//
// WHY this exists:
// → One job: figure out which API key to use
// → Three clearly named strategies — no tangled if/else
// → Each strategy is independent and testable
// → Clear typed results — no silent failures
//
// THREE STRATEGIES:
// A) resolveForStudio  → owner testing their own agent (draft ok)
// B) resolveForPublic  → stranger on public widget (live only)
// C) resolveForDirect  → developer calling API directly
// ──────────────────────────────────────────────────────────────────

import type { IKeyRepository } from "../ports/IKeyRepository.js";
import type { IAgentRepository } from "../ports/IAgentRepository.js";
import { logger } from "../lib/logger.js";

// Every call returns one of these shapes
// No ambiguity — caller always knows exactly what happened
export type KeyResolutionResult =
  | {
      ok: true;
      apiKey: string;      // decrypted key ready to use
      model: string;       // which AI model to use
      instructions: string;// agent system prompt
      ownerId: string;     // who owns this agent
      provider: string;    // which provider to call
    }
  | {
      ok: false;
      reason: "NO_API_KEY";   // user exists but no key saved
      provider: string;        // tells frontend WHICH provider is missing
    }
  | {
      ok: false;
      reason: "AGENT_NOT_FOUND"; // no live agent with this ID
    }
  | {
      ok: false;
      reason: "NOT_OWNER"; // user tried to test agent they don't own
    };

// Helper — detect provider from model name.
// v2 design decision #2: OpenAI is the only PERMANENT supported provider.
// Groq is a TEMPORARY exception kept live for testing until OpenAI is
// funded — remove this branch once that happens.
export function getProviderForModel(model: string): string {
  if (model.includes("llama") || model.includes("mixtral") ||
      model.includes("whisper"))                                      return "groq";
  return "openai";
}

export class KeyResolutionService {

  constructor(
    private keyRepo: IKeyRepository,    // injected — real or fake
    private agentRepo: IAgentRepository // injected — real or fake
  ) {}

  // ───────────────────────────────────────────────────────────────
  // STRATEGY A: Studio Preview
  //
  // Who uses this:
  // → Agent owner clicking Test Agent tab in dashboard
  //
  // Rules:
  // → Agent can be draft/testing/live — owner can always test
  // → Uses owner's own API key
  // → Rejects anyone who doesn't own the agent
  // ───────────────────────────────────────────────────────────────
  async resolveForStudio(
    verifiedUserId: string,    // from JWT — confirmed identity
    agentId: string,
    requestedProvider: string, // provider sent by frontend (may be empty)
    fallbackModel: string,
    fallbackInstructions: string
  ): Promise<KeyResolutionResult> {

    logger.info({ verifiedUserId, agentId }, "KeyResolutionService: resolveForStudio");

    // Step 1: Does this user own this agent?
    const agent = await this.agentRepo.findByOwner(agentId, verifiedUserId);

    if (!agent) {
      // Agent not found OR user doesn't own it
      // Return same error for both — never leak info
      logger.warn({ verifiedUserId, agentId }, "KeyResolutionService: agent not found or not owned");
      return { ok: false, reason: "NOT_OWNER" };
    }

    // Step 2: Determine which provider to use
    const resolvedModel    = agent.model || fallbackModel;
    const resolvedProvider = requestedProvider || getProviderForModel(resolvedModel);

    // Step 3: Get owner's API key for this provider
    const apiKey = await this.keyRepo.getKey(verifiedUserId, resolvedProvider);

    if (!apiKey) {
      // User owns the agent but hasn't saved an API key yet
      // Frontend should show "Add your API key in Settings"
      logger.warn({ verifiedUserId, resolvedProvider }, "KeyResolutionService: no API key found");
      return { ok: false, reason: "NO_API_KEY", provider: resolvedProvider };
    }

    // Step 4: Everything resolved — return clean values
    logger.info({ verifiedUserId, agentId, resolvedProvider }, "KeyResolutionService: studio resolved ok");
    return {
      ok: true,
      apiKey,
      model:        resolvedModel,
      instructions: agent.instructions || fallbackInstructions,
      ownerId:      verifiedUserId,
      provider:     resolvedProvider,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // STRATEGY B: Public Widget
  //
  // Who uses this:
  // → Stranger visiting a deployed chatbot
  //
  // Rules:
  // → Agent MUST be live — draft never exposed to public
  // → Uses the OWNER's key — not the visitor's
  // → Owner pays for their chatbot's usage
  // ───────────────────────────────────────────────────────────────
  async resolveForPublic(
    agentId: string,
    requestedProvider: string,
    fallbackModel: string,
    fallbackInstructions: string
  ): Promise<KeyResolutionResult> {

    logger.info({ agentId }, "KeyResolutionService: resolveForPublic");

    // Step 1: Is there a LIVE agent with this ID?
    const agent = await this.agentRepo.findLive(agentId);

    if (!agent) {
      logger.warn({ agentId }, "KeyResolutionService: no live agent found");
      return { ok: false, reason: "AGENT_NOT_FOUND" };
    }

    // Step 2: Determine provider from agent's model
    const resolvedModel    = agent.model || fallbackModel;
    const resolvedProvider = requestedProvider || getProviderForModel(resolvedModel);

    // Step 3: Get OWNER's key — visitor has no key
    const apiKey = await this.keyRepo.getKey(agent.user_id, resolvedProvider);

    if (!apiKey) {
      logger.warn({ ownerId: agent.user_id, resolvedProvider }, "KeyResolutionService: owner has no key");
      return { ok: false, reason: "NO_API_KEY", provider: resolvedProvider };
    }

    logger.info({ agentId, resolvedProvider }, "KeyResolutionService: public resolved ok");
    return {
      ok: true,
      apiKey,
      model:        resolvedModel,
      instructions: agent.instructions || fallbackInstructions,
      ownerId:      agent.user_id,
      provider:     resolvedProvider,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // STRATEGY C: Direct / Playground
  //
  // Who uses this:
  // → Developer calling the API directly without an agent
  //
  // Rules:
  // → No agent involved
  // → Uses caller's own key
  // ───────────────────────────────────────────────────────────────
  async resolveForDirect(
    verifiedUserId: string,
    requestedProvider: string,
    fallbackModel: string,
    fallbackInstructions: string
  ): Promise<KeyResolutionResult> {

    logger.info({ verifiedUserId, requestedProvider }, "KeyResolutionService: resolveForDirect");

    const resolvedProvider = requestedProvider || getProviderForModel(fallbackModel);
    const apiKey = await this.keyRepo.getKey(verifiedUserId, resolvedProvider);

    if (!apiKey) {
      logger.warn({ verifiedUserId, resolvedProvider }, "KeyResolutionService: no key for direct call");
      return { ok: false, reason: "NO_API_KEY", provider: resolvedProvider };
    }

    logger.info({ verifiedUserId, resolvedProvider }, "KeyResolutionService: direct resolved ok");
    return {
      ok: true,
      apiKey,
      model:        fallbackModel,
      instructions: fallbackInstructions,
      ownerId:      verifiedUserId,
      provider:     resolvedProvider,
    };
  }
}