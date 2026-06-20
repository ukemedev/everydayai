import { createClient } from "@supabase/supabase-js";
import { KeyResolutionService } from "../services/KeyResolutionService.js";
import { SupabaseKeyRepository } from "../adapters/SupabaseKeyRepository.js";
import { SupabaseAgentRepository } from "../adapters/SupabaseAgentRepository.js";
import { LLMService } from "../services/LLMService.js";
import { buildHardenedSystemPrompt } from "./sanitize.js";
import { runAgentTools } from "./toolRunner.js";
import { sendChannelReply } from "./channelSender.js";
import { logger } from "./logger.js";
import type { IncomingMessageJob } from "./queue.js";

const llmService = new LLMService();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function processIncomingMessage(job: IncomingMessageJob) {
  const { agentId, conversationId, channel, message, ownerUserId } = job;

  const sb = getServiceClient();
  if (!sb) throw new Error("No Supabase client");

  let apiKey: string;
  let model: string;
  let instructions: string;
  let provider: string;

  if (job.resolvedApiKey && job.resolvedProvider && job.resolvedModel) {
    apiKey = job.resolvedApiKey;
    provider = job.resolvedProvider;
    model = job.resolvedModel;
    instructions = job.resolvedInstructions || "";
    logger.info({ agentId, channel }, "Using pre-resolved credentials from job");
  } else {
    const keyService = new KeyResolutionService(
      new SupabaseKeyRepository(sb as any),
      new SupabaseAgentRepository(sb as any)
    );
    let keyResult;
    if (channel === "test") {
      if (!ownerUserId) throw new Error("ownerUserId required for test channel");
      keyResult = await keyService.resolveForStudio(ownerUserId, agentId, "", "gpt-4o-mini", "");
    } else {
      keyResult = await keyService.resolveForPublic(agentId, "", "gpt-4o-mini", "");
    }
    if (!keyResult.ok) {
      logger.warn({ agentId, channel, reason: keyResult.reason }, "Key resolution failed");
      return;
    }
    apiKey = keyResult.apiKey;
    model = keyResult.model;
    instructions = keyResult.instructions;
    provider = keyResult.provider;
  }

  const { data: messages } = await sb
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);

  const history = ((messages ?? []) as { role: string; content: string }[])
    .reverse()
    .filter(m => m.role === "customer" || m.role === "ai")
    .slice(0, -1)
    .map(m => ({
      role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

  await sb.from("messages").insert({
    conversation_id: conversationId,
    role: "customer",
    content: message,
  });

  const systemPrompt = buildHardenedSystemPrompt(instructions);
  const llmResult = await llmService.chat(provider, {
    apiKey,
    model,
    instructions: systemPrompt,
    message,
    conversationHistory: history,
  });

  const reply = llmResult.reply;

  await sb.from("messages").insert({
    conversation_id: conversationId,
    role: "ai",
    content: reply,
  });

  await sb.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: reply.slice(0, 75),
  }).eq("id", conversationId);

  void runAgentTools(agentId, conversationId, message, reply, sb)
    .catch(err => logger.error({ err, agentId }, "runAgentTools failed"));

  await sendChannelReply(channel, agentId, conversationId, reply);

  logger.info({ agentId, channel, conversationId }, "AI reply processed and delivered");
}
