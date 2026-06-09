import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { checkMessageLimit, getUserPlan } from "../lib/planLimits.js";
import {
  checkAgentDailyLimit, incrementAgentDailyCount,
  checkSessionLimit, checkIpRateLimit, FRIENDLY_LIMIT_MESSAGE,
  checkCustomerDailyLimit, incrementCustomerDailyCount,
  checkBurstLimit, isDuplicateMessage, isAiCooldownActive,
  setAiCooldown, CUSTOMER_DAILY_LIMIT_MESSAGE,
  BURST_LIMIT_MESSAGE, DUPLICATE_MESSAGE, COOLDOWN_MESSAGE,
} from "../lib/agentLimits.js";
import {
  sanitizeText, validateMessageLength,
  detectPromptInjection, buildHardenedSystemPrompt,
} from "../lib/sanitize.js";
import { logAudit } from "../lib/auditLog.js";
import {
  buildToolsContext, executeToolsInReply,
  type ToolRecord,
} from "../lib/toolEngine.js";
import { KeyResolutionService } from "../services/KeyResolutionService.js";
import { LLMService } from "../services/LLMService.js";
import { LLMError } from "../ports/ILLMProvider.js";
import { SupabaseKeyRepository } from "../adapters/SupabaseKeyRepository.js";
import { SupabaseAgentRepository } from "../adapters/SupabaseAgentRepository.js";

const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (
  buf: Buffer, options?: object
) => Promise<{ text: string; numpages: number }>;
const mammoth = _require("mammoth") as {
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
};

const router = Router();
const llmService = new LLMService();

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface DocRecord {
  file_name: string;
  file_type: string | null;
  storage_path: string | null;
}

async function extractText(
  buffer: Buffer, fileType: string | null, fileName: string
): Promise<string> {
  const ext = (fileType ?? fileName.split(".").pop() ?? "")
    .toLowerCase().replace(".", "");
  if (ext === "txt") return buffer.toString("utf-8");
  if (ext === "pdf") {
    try { return (await pdfParse(buffer)).text; }
    catch (err) { logger.error({ err, fileName }, "pdf-parse failed"); return "[PDF failed]"; }
  }
  if (ext === "docx") {
    try { return (await mammoth.extractRawText({ buffer })).value; }
    catch (err) { logger.error({ err, fileName }, "mammoth failed"); return "[DOCX failed]"; }
  }
  return "[Unsupported file type]";
}

async function buildDocumentContext(agentId: string): Promise<string> {
  const sb = getServiceClient();
  if (!sb) return "";
  const { data: docs, error } = await sb
    .from("documents")
    .select("file_name, file_type, storage_path")
    .eq("agent_id", agentId);
  if (error || !docs || docs.length === 0) return "";
  const sections: string[] = [];
  for (const doc of docs as DocRecord[]) {
    if (!doc.storage_path) continue;
    const { data: fileData, error: dlErr } = await sb.storage
      .from("documents").download(doc.storage_path);
    if (dlErr || !fileData) continue;
    const text = await extractText(
      Buffer.from(await fileData.arrayBuffer()), doc.file_type, doc.file_name
    );
    if (!text.trim()) continue;
    sections.push(`--- Document: ${doc.file_name} ---\n${text.trim()}\n---`);
  }
  if (sections.length === 0) return "";
  return "\n\nKnowledge base documents:\n\n" + sections.join("\n\n") +
    "\n\nUse these to answer questions accurately.";
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  message?: string;
  instructions?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  conversationHistory?: ConversationMessage[];
  agentId?: string;
  userId?: string;
  sessionId?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "voice" | "image" | "file";
  content?: string;
  base64?: string;
  mimeType?: string;
  filename?: string;
}

router.post("/chat", async (req: Request, res: Response) => {

  const {
    message, instructions, model, provider,
    conversationHistory, agentId, userId,
    sessionId, attachments,
  } = req.body as ChatBody;

  const verifiedUserId = req.user?.id ?? null;
  const isPublicChat = !verifiedUserId;

  if (!message?.trim() && !attachments?.length) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const cleanMessage = sanitizeText(message ?? "");
  const lengthCheck = validateMessageLength(cleanMessage, 4000);
  if (!lengthCheck) {
    res.status(400).json({ error: "Message is too long. Maximum 4000 characters allowed." });
    return;
  }

  if (detectPromptInjection(cleanMessage)) {
    req.log.warn({ agentId }, "prompt injection detected");
    res.status(400).json({ error: "Message contains invalid content." });
    return;
  }

  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? conversationHistory : [];

  const clientIp = (
    req.headers["x-forwarded-for"] as string | undefined
  )?.split(",")[0]?.trim() ?? req.ip ?? "unknown";

  if (!checkIpRateLimit(clientIp).allowed) {
    res.status(429).json({ error: "TOO_MANY_REQUESTS", message: FRIENDLY_LIMIT_MESSAGE });
    return;
  }

  const sessionIdStr = sessionId?.trim() || clientIp;

  if (agentId?.trim() && !checkSessionLimit("free", history.length)) {
    res.status(429).json({ error: "SESSION_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
    return;
  }

  if (agentId?.trim() && !checkBurstLimit(agentId.trim(), sessionIdStr).allowed) {
    res.status(429).json({ error: "BURST_LIMIT_REACHED", message: BURST_LIMIT_MESSAGE });
    return;
  }

  if (agentId?.trim() && isDuplicateMessage(agentId.trim(), sessionIdStr, cleanMessage)) {
    res.status(429).json({ error: "DUPLICATE_MESSAGE", message: DUPLICATE_MESSAGE });
    return;
  }

  if (isPublicChat && agentId?.trim()) {
    if (!checkAgentDailyLimit(agentId.trim(), "free").allowed) {
      res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
      return;
    }
    const customerId = sessionIdStr;
    if (!checkCustomerDailyLimit(agentId.trim(), customerId, "free").allowed) {
      res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: CUSTOMER_DAILY_LIMIT_MESSAGE });
      return;
    }
    if (isAiCooldownActive(agentId.trim(), customerId)) {
      res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: COOLDOWN_MESSAGE });
      return;
    }
    incrementCustomerDailyCount(agentId.trim(), customerId);
    setAiCooldown(agentId.trim(), customerId);
  }

  if (verifiedUserId) {
    const sb = getServiceClient();
    if (sb) {
      try {
        const plan = await getUserPlan(verifiedUserId);
        const limitResult = await checkMessageLimit(verifiedUserId);
        if (!limitResult.allowed) {
          res.status(429).json({ error: "PLAN_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
          return;
        }
      } catch (err) {
        logger.error({ err }, "plan limit check failed — allowing request");
      }
    }
  }

  const sb = getServiceClient();
  let keyResult;

  if (sb) {
    const keyService = new KeyResolutionService(
      new SupabaseKeyRepository(sb as any),
      new SupabaseAgentRepository(sb as any)
    );

    if (verifiedUserId && agentId?.trim()) {
      keyResult = await keyService.resolveForStudio(
        verifiedUserId, agentId.trim(),
        provider ?? "", model ?? "gpt-4o-mini", instructions ?? ""
      );
    } else if (!verifiedUserId && agentId?.trim()) {
      keyResult = await keyService.resolveForPublic(
        agentId.trim(),
        provider ?? "", model ?? "gpt-4o-mini", instructions ?? ""
      );
    } else if (verifiedUserId) {
      keyResult = await keyService.resolveForDirect(
        verifiedUserId,
        provider ?? "", model ?? "gpt-4o-mini", instructions ?? ""
      );
    } else {
      res.status(400).json({ error: "NO_API_KEY", provider: provider ?? "openai" });
      return;
    }
  } else {
    if (!req.body.apiKey) {
      res.status(400).json({ error: "NO_API_KEY", provider: provider ?? "openai" });
      return;
    }
    keyResult = {
      ok: true as const,
      apiKey: req.body.apiKey,
      model: model ?? "gpt-4o-mini",
      instructions: instructions ?? "",
      ownerId: verifiedUserId ?? "",
      provider: provider ?? "openai",
    };
  }

  if (!keyResult.ok) {
    if (keyResult.reason === "NO_API_KEY") {
      res.status(400).json({ error: "NO_API_KEY", provider: keyResult.provider });
    } else if (keyResult.reason === "AGENT_NOT_FOUND") {
      res.status(404).json({ error: "Agent not found or not published" });
    } else {
      res.status(403).json({ error: "Not authorized for this agent" });
    }
    return;
  }

  const resolvedApiKey   = keyResult.apiKey;
  const resolvedModel    = keyResult.model;
  const resolvedProvider = keyResult.provider;
  const baseInstructions = keyResult.instructions;
  const agentOwnerId     = keyResult.ownerId;

  req.log.info(
    { provider: resolvedProvider, model: resolvedModel, agentId },
    "chat request received"
  );

  let docContext = "";
  if (agentId?.trim()) {
    try {
      docContext = await buildDocumentContext(agentId.trim());
    } catch (err) {
      logger.error({ err, agentId }, "buildDocumentContext failed");
    }
  }

  let toolsContext = "";
  let agentTools: ToolRecord[] = [];
  if (agentId?.trim()) {
    try {
      const result = await buildToolsContext(agentId.trim(), getServiceClient());
      toolsContext = result.prompt;
      agentTools   = result.tools;
    } catch (err) {
      logger.error({ err, agentId }, "buildToolsContext failed");
    }
  }

  const systemPrompt = buildHardenedSystemPrompt(
    baseInstructions + docContext + toolsContext
  );

  const attachmentList = Array.isArray(attachments)
    ? attachments as Attachment[] : [];
  let effectiveMessage = cleanMessage;
  const imageAtt = attachmentList.find(
    a => a.type === "image" && a.base64 && a.mimeType
  );

  for (const a of attachmentList) {
    if (a.type === "voice" && a.content?.trim()) {
      effectiveMessage =
        `[Voice note]: "${a.content.trim()}"\n\n${effectiveMessage}`.trim();
    }
    if (a.type === "file" && a.content?.trim()) {
      const label = a.filename ? ` (${a.filename})` : "";
      effectiveMessage =
        `${effectiveMessage}\n\n[Uploaded document${label}]:\n${a.content.trim()}`.trim();
    }
  }

  try {
    const llmResult = await llmService.chat(resolvedProvider, {
      apiKey:              resolvedApiKey,
      model:               resolvedModel,
      instructions:        systemPrompt,
      message:             effectiveMessage || "[Image]",
      conversationHistory: history,
      ...(imageAtt?.base64 && imageAtt?.mimeType
        ? { image: { base64: imageAtt.base64, mimeType: imageAtt.mimeType } }
        : {}),
    });

    let reply = llmResult.reply;

    const toolOwnerId = verifiedUserId ?? agentOwnerId;
    const { reply: cleanedReply, results: toolCallResults } =
      await executeToolsInReply(reply, agentTools, toolOwnerId, getServiceClient());
    reply = cleanedReply;

    if (isPublicChat && agentId?.trim()) {
      incrementAgentDailyCount(agentId.trim());
    }

    if (userId?.trim()) {
      const sbInner = getServiceClient();
      if (sbInner) {
        try {
          const { data: profile } = await sbInner
            .from("profiles")
            .select("message_count")
            .eq("id", userId.trim())
            .single();
          if (profile) {
            await sbInner
              .from("profiles")
              .update({ message_count: (profile.message_count ?? 0) + 1 })
              .eq("id", userId.trim());
          }
        } catch { /* non-fatal */ }
      }
      void logAudit({
        user_id:     userId.trim(),
        action:      "message_sent",
        resource:    "agent",
        resource_id: agentId?.trim() || undefined,
        req,
      });
    }

    if (isPublicChat && agentId?.trim()) {
      const sbInner = getServiceClient();
      if (sbInner) {
        try {
          const { data: existing } = await sbInner
            .from("conversations")
            .select("id, mode, unread_count")
            .eq("agent_id", agentId.trim())
            .eq("channel", "web")
            .eq("channel_conversation_id", sessionIdStr)
            .maybeSingle();

          let conversationId: string;

          if (existing) {
            conversationId = (existing as { id: string }).id;
            const needsModeReset = (existing as { mode: string }).mode === "human";
            await sbInner.from("conversations").update({
              last_message_at:      new Date().toISOString(),
              last_message_preview: reply.slice(0, 75),
              unread_count: (existing as { unread_count: number }).unread_count + 1,
              status: "active",
              ...(needsModeReset ? { mode: "ai" } : {}),
            }).eq("id", conversationId);
          } else {
            const { data: agentRow } = await sbInner
              .from("agents")
              .select("user_id, name")
              .eq("id", agentId.trim())
              .maybeSingle();
            const ownerId   = agentRow ? (agentRow as { user_id: string }).user_id : "";
            const agentName = agentRow ? (agentRow as { name: string }).name : null;
            const { data: newConv } = await sbInner
              .from("conversations")
              .insert({
                agent_id:                agentId.trim(),
                agent_name:              agentName,
                owner_id:                ownerId,
                channel:                 "web",
                channel_conversation_id: sessionIdStr,
                customer_display:        "Web visitor",
                mode:                    "ai",
                status:                  "active",
                unread_count:            1,
                last_message_at:         new Date().toISOString(),
                last_message_preview:    reply.slice(0, 75),
              })
              .select("id")
              .single();
            conversationId = (newConv as { id: string }).id;
          }

          await sbInner.from("messages").insert([
            { conversation_id: conversationId, role: "customer", content: cleanMessage },
            { conversation_id: conversationId, role: "ai",       content: reply },
          ]);
        } catch (persistErr) {
          req.log.error({ err: persistErr }, "failed to persist conversation — non-fatal");
        }
      }
    }

    res.json({
      reply,
      toolCalls: toolCallResults.length > 0 ? toolCallResults : null,
    });

  } catch (err) {
    req.log.error({ err, provider: resolvedProvider }, "chat completion failed");

    if (err instanceof LLMError) {
      switch (err.code) {
        case "INVALID_KEY":
          res.status(401).json({ error: "Invalid API key. Check your key in Settings." });
          break;
        case "RATE_LIMIT":
          res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
          break;
        case "PROVIDER_DOWN":
          res.status(503).json({ error: err.userMessage });
          break;
        case "TIMEOUT":
          res.status(504).json({ error: "AI took too long to respond. Try again." });
          break;
        default:
          res.status(500).json({ error: "Failed to get a response. Please try again." });
      }
      return;
    }

    const errMsg = err instanceof Error ? err.message.toLowerCase() : "";
    if (errMsg.includes("api key") || errMsg.includes("401")) {
      res.status(401).json({ error: "Invalid API key. Check your key in Settings." });
    } else if (errMsg.includes("rate limit") || errMsg.includes("429")) {
      res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    } else {
      res.status(500).json({ error: "Failed to get a response. Please try again." });
    }
  }
});

export default router;
