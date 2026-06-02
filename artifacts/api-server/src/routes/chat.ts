import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { checkMessageLimit, getUserPlan } from "../lib/planLimits.js";
import { checkAgentDailyLimit, incrementAgentDailyCount, checkSessionLimit, checkIpRateLimit, FRIENDLY_LIMIT_MESSAGE } from "../lib/agentLimits.js";
import { sanitizeText, validateMessageLength, detectPromptInjection, buildHardenedSystemPrompt } from "../lib/sanitize.js";
import { logAudit } from "../lib/auditLog.js";
import {
  buildToolsContext,
  executeToolsInReply,
  type ToolRecord,
} from "../lib/toolEngine.js";

// Maps a model name to its provider, mirroring the frontend catalogue.
function getProviderForModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.includes("llama") || model.includes("mixtral") || model.includes("whisper")) return "groq";
  return "openai";
}


// pdf-parse and mammoth are externalized in esbuild — load via require at runtime
const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (
  buf: Buffer,
  options?: object
) => Promise<{ text: string; numpages: number }>;
const mammoth = _require("mammoth") as {
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
};

const router = Router();

// ─── Supabase service-role client ─────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn("VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — document context disabled");
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Text extraction ──────────────────────────────────────────────────────────

interface DocRecord {
  file_name: string;
  file_type: string | null;
  storage_path: string | null;
}

async function extractText(buffer: Buffer, fileType: string | null, fileName: string): Promise<string> {
  const ext = (fileType ?? fileName.split(".").pop() ?? "").toLowerCase().replace(".", "");

  logger.info({ ext, bufferBytes: buffer.length, fileName }, "extracting text from document");

  if (ext === "txt") {
    const text = buffer.toString("utf-8");
    logger.info({ fileName, textLength: text.length }, "txt extraction complete");
    return text;
  }

  if (ext === "pdf") {
    try {
      const result = await pdfParse(buffer);
      logger.info({ fileName, textLength: result.text.length, pages: result.numpages }, "pdf extraction complete");
      return result.text;
    } catch (err) {
      logger.error({ err, fileName }, "pdf-parse failed");
      return "[PDF text extraction failed]";
    }
  }

  if (ext === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      logger.info({ fileName, textLength: result.value.length }, "docx extraction complete");
      return result.value;
    } catch (err) {
      logger.error({ err, fileName }, "mammoth extraction failed");
      return "[DOCX text extraction failed]";
    }
  }

  logger.warn({ ext, fileName }, "unsupported file type");
  return "[Unsupported file type]";
}

// ─── Document context builder ─────────────────────────────────────────────────

async function buildDocumentContext(agentId: string): Promise<string> {
  const sb = getServiceClient();
  if (!sb) return "";

  const { data: docs, error: dbErr } = await sb
    .from("documents")
    .select("file_name, file_type, storage_path")
    .eq("agent_id", agentId);

  if (dbErr) {
    logger.error({ err: dbErr, agentId }, "failed to fetch documents from DB");
    return "";
  }

  if (!docs || docs.length === 0) {
    logger.info({ agentId }, "no documents found for agent");
    return "";
  }

  logger.info({ agentId, docCount: docs.length }, "fetched documents for agent");

  const sections: string[] = [];

  for (const doc of docs as DocRecord[]) {
    if (!doc.storage_path) {
      logger.warn({ fileName: doc.file_name }, "document has no storage_path, skipping");
      continue;
    }

    logger.info({ storagePath: doc.storage_path }, "downloading document from storage");

    const { data: fileData, error: dlErr } = await sb.storage
      .from("documents")
      .download(doc.storage_path);

    if (dlErr || !fileData) {
      logger.error({ err: dlErr, storagePath: doc.storage_path }, "storage download failed");
      continue;
    }

    const arrayBuf = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    logger.info({ fileName: doc.file_name, bufferBytes: buffer.length }, "download complete");

    const text = await extractText(buffer, doc.file_type, doc.file_name);

    if (!text.trim()) {
      logger.warn({ fileName: doc.file_name }, "extracted text is empty");
      continue;
    }

    logger.info({ fileName: doc.file_name, preview: text.slice(0, 120) }, "document text preview");

    sections.push(
      `--- Document: ${doc.file_name} ---\n${text.trim()}\n----------------------------`
    );
  }

  if (sections.length === 0) {
    logger.warn({ agentId }, "all documents failed extraction — no context injected");
    return "";
  }

  const context =
    "\n\nYou have access to the following knowledge base documents:\n\n" +
    sections.join("\n\n") +
    "\n\nUse these documents to answer questions accurately.";

  logger.info({ agentId, contextLength: context.length, docsInjected: sections.length }, "document context built");
  return context;
}

// ─── Provider call helpers ────────────────────────────────────────────────────

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
  type:      "voice" | "image" | "file";
  content?:  string;   // voice transcript or extracted file text
  base64?:   string;   // raw image bytes as base64
  mimeType?: string;   // image/file MIME type
  filename?: string;   // original filename
}

async function callOpenAI(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

async function callAnthropic(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model, max_tokens: 1024, system: systemPrompt,
    messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "No response from model.";
}

async function callGoogle(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
  const chat = genModel.startChat({
    history: history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

async function callGroq(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string
): Promise<string> {
  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

// ─── Vision-capable call functions ────────────────────────────────────────────

async function callOpenAIVision(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string,
  imageBase64: string, imageMimeType: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      {
        role: "user",
        content: [
          { type: "text" as const,      text: message },
          { type: "image_url" as const, image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
        ],
      },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

async function callAnthropicVision(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string,
  imageBase64: string, imageMimeType: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model, max_tokens: 1024, system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: [
          {
            type: "image" as const,
            source: {
              type:       "base64" as const,
              media_type: imageMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data:       imageBase64,
            },
          },
          { type: "text" as const, text: message },
        ],
      },
    ],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "No response from model.";
}

async function callGoogleVision(
  apiKey: string, model: string, systemPrompt: string,
  history: ConversationMessage[], message: string,
  imageBase64: string, imageMimeType: string
): Promise<string> {
  const genAI    = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
  const chat = genModel.startChat({
    history: history.map((m) => ({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });
  const result = await chat.sendMessage([
    { text: message },
    { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
  ]);
  return result.response.text();
}

// ─── Public agent info endpoint ───────────────────────────────────────────────

router.get("/public/agents/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data, error } = await sb
    .from("agents")
    .select("id, name, description, status, model, input_capabilities")
    .eq("id", agentId)
    .maybeSingle();

  if (error || !data) { res.status(404).json({ error: "Agent not found" }); return; }
  req.log.info({ agentId, status: (data as { status: string }).status }, "public agent info fetched");
  res.json({ agent: data });
});

// ─── Chat route ───────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, provider, apiKey, conversationHistory, agentId, userId, sessionId, attachments } =
    req.body as ChatBody;

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!message?.trim() && !hasAttachments) { res.status(400).json({ error: "message is required" }); return; }

  // ── Sanitize and validate the incoming message ─────────────────────────────
  const cleanMessage = sanitizeText(message ?? "");

  if (!validateMessageLength(cleanMessage, 2000)) {
    res.status(400).json({ error: "Message is too long. Maximum 2000 characters." });
    return;
  }

  if (instructions && !validateMessageLength(instructions, 10000)) {
    res.status(400).json({ error: "Instructions are too long. Maximum 10000 characters." });
    return;
  }

  if (detectPromptInjection(cleanMessage)) {
    console.warn("Prompt injection attempt:", {
      ip: req.ip,
      message: cleanMessage.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
    req.log.warn({ agentId, userId, ip: req.ip }, "Prompt injection attempt detected");
    res.status(400).json({ error: "Invalid message content" });
    return;
  }

  // ── Verify identity for studio sessions ───────────────────────────────────
  // SECURITY: Never trust userId from the request body without a verified JWT.
  // Only use the verified identity from the Authorization header for key lookups.
  let verifiedUserId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const sb = getServiceClient();
    if (sb) {
      const { data, error } = await sb.auth.getUser(token);
      if (!error && data.user) {
        verifiedUserId = data.user.id;
      }
    }
  }

  // ── Validate and sanitize conversation history ─────────────────────────────
  const MAX_HISTORY = 50;
  let history: ConversationMessage[] = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: sanitizeText(String(m.content ?? "").slice(0, 2000)),
    }))
    .filter((m) => m.content.length > 0);

  // ── Message limit check (only for verified studio sessions) ───────────────
  if (verifiedUserId) {
    const limitCheck = await checkMessageLimit(verifiedUserId);
    if (!limitCheck.allowed) {
      res.status(403).json({
        error:   "MESSAGE_LIMIT_REACHED",
        current: limitCheck.current,
        limit:   limitCheck.limit,
        plan:    "free",
      });
      return;
    }
  }

  // ── Public chat protection — IP rate limit (no auth header) ───────────────
  // Applied before key resolution so abuse is stopped as early as possible.
  const isPublicChat = !verifiedUserId && !!agentId?.trim();
  if (isPublicChat) {
    const clientIp  = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const ipCheck   = checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      req.log.warn({ ip: clientIp, agentId }, "public chat IP rate limit hit");
      res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
      return;
    }
  }

  // Resolve API key — never trust apiKey sent from the frontend.
  // Always look up server-side from the verified user or the live agent's owner.
  let resolvedApiKey    = "";
  let resolvedModel     = model?.trim()    || "gpt-4o-mini";
  let resolvedProvider  = provider?.trim() || "openai";
  let baseInstructions  = instructions?.trim() || "You are a helpful assistant.";
  let agentOwnerId      = "";

  // 1. Studio session — JWT-verified user's own key.
  if (!resolvedApiKey && verifiedUserId) {
    const sb = getServiceClient();
    if (sb) {
      const { data: keyRow } = await sb
        .from("api_keys")
        .select("api_key")
        .eq("user_id", verifiedUserId)
        .eq("provider", resolvedProvider)
        .maybeSingle();
      if (keyRow?.api_key) {
        const { decrypt, isEncrypted } = await import("../lib/encryption.js");
        const raw = keyRow.api_key as string;
        resolvedApiKey = isEncrypted(raw) ? decrypt(raw) : raw;
      }
    }
  }

  // 2. Public / shared chat — agent must be live; use the agent owner's key.
  if (!resolvedApiKey && agentId?.trim()) {
    const sb = getServiceClient();
    if (sb) {
      const { data: agentRow } = await sb
        .from("agents")
        .select("user_id, model, instructions")
        .eq("id", agentId.trim())
        .eq("status", "live")
        .maybeSingle();
      if (agentRow) {
        agentOwnerId = agentRow.user_id as string;
        if (!model?.trim())        resolvedModel        = (agentRow.model as string)        || "gpt-4o-mini";
        if (!instructions?.trim()) baseInstructions     = (agentRow.instructions as string) || "You are a helpful assistant.";
        if (!provider?.trim())     resolvedProvider     = getProviderForModel(resolvedModel);

        // ── Per-agent daily limit and session limit ──────────────────────────
        // Only enforced on public chat (not studio sessions — those have their own plan limits).
        if (isPublicChat) {
          // Get agent owner's plan to determine limits
          const ownerPlan = await getUserPlan(agentOwnerId).catch(() => "free");

          // 1. Agent daily message cap
          const dailyCheck = checkAgentDailyLimit(agentId.trim(), ownerPlan);
          if (!dailyCheck.allowed) {
            req.log.warn({ agentId, ownerPlan, dailyCount: dailyCheck.count, dailyLimit: dailyCheck.limit }, "agent daily message limit reached");
            res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
            return;
          }

          // 2. Session message cap (count user turns already in history)
          const userTurnsInSession = history.filter((m) => m.role === "user").length;
          if (!checkSessionLimit(ownerPlan, userTurnsInSession)) {
            req.log.warn({ agentId, ownerPlan, userTurns: userTurnsInSession }, "session message limit reached");
            res.status(429).json({ error: "CHAT_LIMIT_REACHED", message: FRIENDLY_LIMIT_MESSAGE });
            return;
          }
        }

        const { data: keyRow } = await sb
          .from("api_keys")
          .select("api_key")
          .eq("user_id", agentOwnerId)
          .eq("provider", resolvedProvider)
          .maybeSingle();
        if (keyRow?.api_key) {
          const { decrypt, isEncrypted } = await import("../lib/encryption.js");
          const raw = keyRow.api_key as string;
          resolvedApiKey = isEncrypted(raw) ? decrypt(raw) : raw;
        }
      }
    }
  }

  if (!resolvedApiKey) {
    res.status(400).json({ error: "NO_API_KEY", provider: resolvedProvider });
    return;
  }

  req.log.info(
    { provider: resolvedProvider, model: resolvedModel, historyLength: history.length, agentId },
    "chat request received"
  );

  // Fetch knowledge base documents
  let docContext = "";
  if (agentId?.trim()) {
    try {
      docContext = await buildDocumentContext(agentId.trim());
    } catch (err) {
      logger.error({ err, agentId }, "buildDocumentContext threw unexpectedly");
    }
  }

  // Fetch tools for this agent
  let toolsContext = "";
  let agentTools: ToolRecord[] = [];
  if (agentId?.trim()) {
    try {
      const result = await buildToolsContext(agentId.trim(), getServiceClient());
      toolsContext = result.prompt;
      agentTools   = result.tools;
    } catch (err) {
      logger.error({ err, agentId }, "buildToolsContext threw unexpectedly");
    }
  }

  const systemPrompt = buildHardenedSystemPrompt(baseInstructions + docContext + toolsContext);

  req.log.info(
    { systemPromptLength: systemPrompt.length, docContextLength: docContext.length, toolCount: agentTools.length },
    "system prompt assembled"
  );

  // ── Process attachments (voice transcript / file text / image) ─────────────
  const attachmentList: Attachment[] = Array.isArray(attachments) ? attachments as Attachment[] : [];
  let effectiveMessage = cleanMessage;
  const imageAtt = attachmentList.find((a) => a.type === "image" && a.base64 && a.mimeType);

  for (const a of attachmentList) {
    if (a.type === "voice" && a.content?.trim()) {
      effectiveMessage = `[Voice note]: "${a.content.trim()}"\n\n${effectiveMessage}`.trim();
    }
    if (a.type === "file" && a.content?.trim()) {
      const label = a.filename ? ` (${a.filename})` : "";
      effectiveMessage = `${effectiveMessage}\n\n[Uploaded document${label}]:\n${a.content.trim()}`.trim();
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    let reply: string;
    if (imageAtt?.base64 && imageAtt?.mimeType) {
      switch (resolvedProvider) {
        case "anthropic": reply = await callAnthropicVision(resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage || "[Image]", imageAtt.base64, imageAtt.mimeType); break;
        case "google":    reply = await callGoogleVision   (resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage || "[Image]", imageAtt.base64, imageAtt.mimeType); break;
        case "groq":      reply = await callGroq           (resolvedApiKey, resolvedModel, systemPrompt, history, `[User sent an image. Image analysis unavailable.]\n\n${effectiveMessage}`.trim()); break;
        case "openai":
        default:          reply = await callOpenAIVision   (resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage || "[Image]", imageAtt.base64, imageAtt.mimeType); break;
      }
    } else {
      switch (resolvedProvider) {
        case "anthropic": reply = await callAnthropic(resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage); break;
        case "google":    reply = await callGoogle   (resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage); break;
        case "groq":      reply = await callGroq     (resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage); break;
        case "openai":
        default:          reply = await callOpenAI   (resolvedApiKey, resolvedModel, systemPrompt, history, effectiveMessage); break;
      }
    }

    // ── Tool call execution (shared engine) ──────────────────────────────────
    const toolOwnerId = verifiedUserId ?? agentOwnerId;
    const { reply: cleanedReply, results: toolCallResults } = await executeToolsInReply(
      reply,
      agentTools,
      toolOwnerId,
      getServiceClient()
    );
    reply = cleanedReply;
    if (toolCallResults.length > 0) {
      req.log.info({ count: toolCallResults.length }, "tool calls executed");
    }
    // ─────────────────────────────────────────────────────────────────────────

    req.log.info({ provider: resolvedProvider, model: resolvedModel, hasDocContext: docContext.length > 0 }, "chat completion successful");

    // Increment agent daily counter for public chat
    if (isPublicChat && agentId?.trim()) {
      incrementAgentDailyCount(agentId.trim());
    }

    // Increment message count for authenticated sessions
    if (userId?.trim()) {
      const sb = getServiceClient();
      if (sb) {
        try {
          const { data: profile } = await sb
            .from("profiles")
            .select("message_count")
            .eq("id", userId.trim())
            .single();
          if (profile) {
            await sb
              .from("profiles")
              .update({ message_count: (profile.message_count ?? 0) + 1 })
              .eq("id", userId.trim());
          }
        } catch {
          // Non-fatal — chat already succeeded
        }
      }

      void logAudit({
        user_id:     userId.trim(),
        action:      "message_sent",
        resource:    "agent",
        resource_id: agentId?.trim() || undefined,
        req,
      });
    }

    // ── Persist conversation to inbox (public chat) ────────────────────
    if (isPublicChat && agentId?.trim()) {
      const clientIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
      const sessionIdStr = sessionId?.trim() || clientIp;
      const sb = getServiceClient();
      if (sb) {
        try {
          // Check if conversation exists
          const { data: existing } = await sb
            .from("conversations")
            .select("id, mode, owner_id, unread_count")
            .eq("agent_id", agentId.trim())
            .eq("channel", "web")
            .eq("channel_conversation_id", sessionIdStr)
            .maybeSingle();

          let conversationId: string;

          if (existing) {
            conversationId = (existing as { id: string }).id;
            // Only update mode if it was auto-locked from a previous limit
            const needsModeReset = (existing as { mode: string }).mode === "human";
            await sb.from("conversations").update({
              last_message_at: new Date().toISOString(),
              last_message_preview: reply.slice(0, 75),
              unread_count: (existing as { unread_count: number }).unread_count + 1,
              status: "active",
              ...(needsModeReset ? { mode: "ai" } : {}),
            }).eq("id", conversationId);
          } else {
            const { data: agent } = await sb
              .from("agents")
              .select("user_id, name")
              .eq("id", agentId.trim())
              .maybeSingle();
            const ownerId = agent ? (agent as { user_id: string }).user_id : "";
            const agentName = agent ? (agent as { name: string }).name : null;
            const { data: newConv } = await sb
              .from("conversations")
              .insert({
                agent_id: agentId.trim(),
                agent_name: agentName,
                owner_id: ownerId,
                channel: "web",
                channel_conversation_id: sessionIdStr,
                customer_display: "Web visitor",
                mode: "ai",
                status: "active",
                unread_count: 1,
                last_message_at: new Date().toISOString(),
                last_message_preview: reply.slice(0, 75),
              })
              .select("id")
              .single();
            conversationId = (newConv as { id: string }).id;
          }

          // Save both customer message and AI reply
          await sb.from("messages").insert([
            { conversation_id: conversationId, role: "customer", content: cleanMessage },
            { conversation_id: conversationId, role: "ai", content: reply },
          ]);
        } catch (persistErr) {
          req.log.error({ err: persistErr }, "failed to persist conversation to inbox");
          // Non-fatal — chat already succeeded, customer already got their reply
        }
      }
    }

    res.json({ reply, toolCalls: toolCallResults.length > 0 ? toolCallResults : null });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, provider: resolvedProvider, model: resolvedModel }, "chat completion failed");

    if (errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("authentication") || errMsg.toLowerCase().includes("401")) {
      res.status(401).json({ error: "Invalid API key. Please check your key in Settings." });
    } else if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("429")) {
      res.status(429).json({ error: "Rate limit or quota exceeded. Try again later." });
    } else {
      res.status(500).json({ error: "Failed to get a response. Please try again." });
    }
  }
});

export default router;
