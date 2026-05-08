import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { checkMessageLimit } from "../lib/planLimits.js";
import { sanitizeText, validateMessageLength, detectPromptInjection } from "../lib/sanitize.js";
import { appendToSheet } from "../lib/googleSheets.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import { sendEmail } from "../lib/gmail.js";

function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? url;
}

// Maps a model name to its provider, mirroring the frontend catalogue.
function getProviderForModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.includes("llama") || model.includes("mixtral") || model.includes("whisper")) return "groq";
  return "openai";
}

// Finds every TOOL_CALL marker in an AI reply, tolerates missing brackets and nested JSON.
function extractToolCallMarkers(text: string): Array<{ raw: string; json: string }> {
  const results: Array<{ raw: string; json: string }> = [];
  // Match optional `[`, then `TOOL_CALL:`, optional whitespace, then opening brace
  const markerRe = /\[?TOOL_CALL:\s*(\{)/g;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text)) !== null) {
    const braceStart = m.index + m[0].length - 1; // position of the opening `{`
    let depth = 0;
    let i = braceStart;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) continue; // unbalanced — skip
    const jsonStr = text.slice(braceStart, i + 1);
    const hasClosingBracket = text[i + 1] === "]";
    const raw = text.slice(m.index, i + 1 + (hasClosingBracket ? 1 : 0));
    results.push({ raw, json: jsonStr });
    // advance past this match to avoid re-processing
    markerRe.lastIndex = i + 1 + (hasClosingBracket ? 1 : 0);
  }
  return results;
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

interface ToolRecord {
  id: string;
  tool_name: string;
  tool_description: string | null;
  connector: string;
  action: string;
  required_inputs: Array<{ name: string; label: string; description: string }> | null;
  required_auth: { type: string; provider: string; description: string } | null;
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
}

async function buildToolsContext(agentId: string): Promise<{ prompt: string; tools: ToolRecord[] }> {
  const sb = getServiceClient();
  if (!sb) return { prompt: "", tools: [] };

  const { data, error } = await sb
    .from("tools")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "active");

  if (error || !data || data.length === 0) return { prompt: "", tools: [] };

  const tools = data as ToolRecord[];

  const toolDescriptions = tools
    .map((t) => {
      const inputs =
        t.required_inputs
          ?.map((i) => `  - ${i.name} (${i.label}): ${i.description}`)
          .join("\n") ?? "  (none)";

      let connectorNotes = "";
      if (t.connector === "google_sheets") {
        connectorNotes = "\nNOTE: The spreadsheet destination is already configured — do NOT ask the user for any URL or spreadsheet ID. Just collect the required data fields and trigger the tool.";
      } else if (t.connector === "telegram") {
        connectorNotes = "\nNOTE: The Telegram bot is already configured — do NOT ask the user for any Telegram handle, chat ID, or bot token. When triggered, the notification is sent automatically. Your inputs should capture the data you want to notify about.";
      } else if (t.connector === "gmail") {
        connectorNotes = "\nNOTE: The Gmail account is already connected — do NOT ask the user for OAuth tokens or credentials. Just collect the recipient address, subject, and body from the conversation.";
      }

      return `Tool ID: ${t.id}\nName: ${t.tool_name}\nDescription: ${t.tool_description ?? ""}\nConnector: ${t.connector}\nAction: ${t.action}\nRequired inputs:\n${inputs}${connectorNotes}`;
    })
    .join("\n\n---\n\n");

  const prompt = `

You have access to the following tools. When you have collected ALL required inputs from the user, output each tool call on its own line in EXACTLY this format, then continue with a friendly confirmation:

[TOOL_CALL:{"tool_id":"<id>","inputs":{"<field_name>":"<value>"}}]

CRITICAL RULES:
- If multiple tools are relevant (e.g. save to Google Sheets AND send a Telegram notification), output ALL tool calls one after another without waiting — use every relevant tool automatically in a single response.
- For google_sheets tools: NEVER ask the user for a spreadsheet URL or ID — it is already saved. Collect only the data fields listed under "Required inputs", then trigger the tool immediately.
- For telegram tools: NEVER ask the user for a Telegram handle, chat ID, or bot token. The bot is pre-configured. Trigger the tool with a "message" input summarising what happened, then confirm to the user that the notification was sent.
- For gmail tools: NEVER ask the user for credentials. Just collect to/subject/body from the conversation.

Available tools:
---
${toolDescriptions}`;

  logger.info({ agentId, toolCount: tools.length }, "tools context built");
  return { prompt, tools };
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

// ─── Public agent info endpoint ───────────────────────────────────────────────

router.get("/public/agents/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data, error } = await sb
    .from("agents")
    .select("id, name, description, status, model")
    .eq("id", agentId)
    .maybeSingle();

  if (error || !data) { res.status(404).json({ error: "Agent not found" }); return; }
  req.log.info({ agentId, status: (data as { status: string }).status }, "public agent info fetched");
  res.json({ agent: data });
});

// ─── Chat route ───────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, provider, apiKey, conversationHistory, agentId, userId } =
    req.body as ChatBody;

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  // ── Sanitize and validate the incoming message ─────────────────────────────
  const cleanMessage = sanitizeText(message);

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

  // ── Message limit check (only for authenticated studio sessions) ───────────
  if (userId?.trim()) {
    const limitCheck = await checkMessageLimit(userId.trim());
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

  // Resolve API key. If none provided (public/shared chat), auto-fetch owner's key via service role.
  let resolvedApiKey    = apiKey?.trim() ?? "";
  let resolvedModel     = model?.trim()    || "gpt-4o-mini";
  let resolvedProvider  = provider?.trim() || "openai";
  let baseInstructions  = instructions?.trim() || "You are a helpful assistant.";

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
        if (!model?.trim())        resolvedModel        = (agentRow.model as string)        || "gpt-4o-mini";
        if (!instructions?.trim()) baseInstructions     = (agentRow.instructions as string) || "You are a helpful assistant.";
        if (!provider?.trim())     resolvedProvider     = getProviderForModel(resolvedModel);
        const { data: keyRow } = await sb
          .from("api_keys")
          .select("api_key")
          .eq("user_id", agentRow.user_id as string)
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

  if (!resolvedApiKey) { res.status(400).json({ error: "apiKey is required" }); return; }

  const history: ConversationMessage[] = Array.isArray(conversationHistory) ? conversationHistory : [];

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
      const result = await buildToolsContext(agentId.trim());
      toolsContext = result.prompt;
      agentTools   = result.tools;
    } catch (err) {
      logger.error({ err, agentId }, "buildToolsContext threw unexpectedly");
    }
  }

  const systemPrompt = baseInstructions + docContext + toolsContext;

  req.log.info(
    { systemPromptLength: systemPrompt.length, docContextLength: docContext.length, toolCount: agentTools.length },
    "system prompt assembled"
  );

  try {
    let reply: string;
    switch (resolvedProvider) {
      case "anthropic": reply = await callAnthropic(resolvedApiKey, resolvedModel, systemPrompt, history, cleanMessage); break;
      case "google":    reply = await callGoogle   (resolvedApiKey, resolvedModel, systemPrompt, history, cleanMessage); break;
      case "groq":      reply = await callGroq     (resolvedApiKey, resolvedModel, systemPrompt, history, cleanMessage); break;
      case "openai":
      default:          reply = await callOpenAI   (resolvedApiKey, resolvedModel, systemPrompt, history, cleanMessage); break;
    }

    // ── Tool call execution ───────────────────────────────────────────────────
    interface ToolCallResult {
      name: string;
      status: "success" | "failed";
      data: Record<string, string>;
      response: string;
      timestamp: string;
    }
    const toolCallResults: ToolCallResult[] = [];

    const markers = extractToolCallMarkers(reply);
    if (markers.length > 0 && agentTools.length > 0) {
      req.log.info({ count: markers.length }, "tool call markers detected in AI response");

      for (const { raw, json } of markers) {
        try {
          const toolCallParsed = JSON.parse(json) as {
            tool_id: string;
            inputs: Record<string, string>;
            spreadsheet_id?: string;
            sheet_name?: string;
          };

          const tool = agentTools.find((t) => t.id === toolCallParsed.tool_id);

          if (!tool || !userId?.trim()) {
            reply = reply.replace(raw, "");
            continue;
          }

          const sb = getServiceClient();
          let resultMsg = "";
          const uid = userId.trim();
          let result: ToolCallResult;

          if (tool.connector === "google_sheets" && sb) {
            const { data: integration } = await sb
              .from("integrations")
              .select("access_token")
              .eq("user_id", uid)
              .eq("provider", "google")
              .maybeSingle();

            if (integration?.access_token) {
              const rowData = tool.required_inputs?.length
                ? tool.required_inputs.map((i: { name: string }) => toolCallParsed.inputs[i.name] ?? "")
                : Object.values(toolCallParsed.inputs);

              const sheetUrl = (tool.required_auth as { spreadsheet_url?: string } | null)?.spreadsheet_url ?? "";
              const spreadsheetId = sheetUrl ? extractSpreadsheetId(sheetUrl) : (toolCallParsed.spreadsheet_id ?? "");

              const sheetResult = await appendToSheet(
                integration.access_token as string,
                spreadsheetId,
                toolCallParsed.sheet_name ?? "Sheet1",
                rowData
              );

              const succeeded = sheetResult.success;
              resultMsg = succeeded ? "✓ Saved to Google Sheets" : `⚠ Could not save to Google Sheets: ${sheetResult.error}`;
              result = {
                name:      tool.tool_name,
                status:    succeeded ? "success" : "failed",
                data:      toolCallParsed.inputs,
                response:  succeeded ? "Row appended successfully" : (sheetResult.error ?? "Unknown error"),
                timestamp: new Date().toISOString(),
              };
            } else {
              resultMsg = "⚠ Google Sheets not connected. Please connect Google in the Tools tab.";
              result = { name: tool.tool_name, status: "failed", data: toolCallParsed.inputs, response: "Google account not connected", timestamp: new Date().toISOString() };
            }

          } else if (tool.connector === "telegram" && sb) {
            const toolOwnerId = (tool as { user_id?: string }).user_id ?? uid;
            const { data: integration } = await sb
              .from("integrations")
              .select("access_token, refresh_token")
              .eq("user_id", toolOwnerId)
              .eq("provider", "telegram")
              .maybeSingle();

            const botToken = integration?.access_token as string | undefined;
            const chatId   = integration?.refresh_token as string | undefined;

            if (botToken && chatId) {
              const summary   = toolCallParsed.inputs.message ?? Object.entries(toolCallParsed.inputs).map(([k, v]) => `${k}: ${v}`).join(", ");
              const tgMessage = `🔔 New notification from ${tool.tool_name}:\n${summary}`;
              const tgResult  = await sendTelegramMessage(botToken, chatId, tgMessage);
              const succeeded = tgResult.success;

              resultMsg = succeeded ? "✓ Telegram message sent" : `⚠ Could not send Telegram message: ${tgResult.error}`;
              result = {
                name:      tool.tool_name,
                status:    succeeded ? "success" : "failed",
                data:      toolCallParsed.inputs,
                response:  succeeded ? "Message delivered" : (tgResult.error ?? "Unknown error"),
                timestamp: new Date().toISOString(),
              };
            } else {
              resultMsg = "⚠ Telegram not connected. Please add your Bot Token and Chat ID in Settings.";
              result = { name: tool.tool_name, status: "failed", data: toolCallParsed.inputs, response: "Telegram credentials not configured", timestamp: new Date().toISOString() };
            }

          } else if (tool.connector === "gmail" && sb) {
            const { data: integration } = await sb
              .from("integrations")
              .select("access_token")
              .eq("user_id", uid)
              .eq("provider", "google")
              .maybeSingle();

            if (integration?.access_token) {
              const to      = toolCallParsed.inputs.to ?? toolCallParsed.inputs.email ?? "";
              const subject = toolCallParsed.inputs.subject ?? "(no subject)";
              const body    = toolCallParsed.inputs.body ?? toolCallParsed.inputs.message ?? "";

              const gmailResult = await sendEmail(integration.access_token as string, to, subject, body);
              const succeeded   = gmailResult.success;

              resultMsg = succeeded ? "✓ Email sent via Gmail" : `⚠ Could not send email: ${gmailResult.error}`;
              result = {
                name:      tool.tool_name,
                status:    succeeded ? "success" : "failed",
                data:      toolCallParsed.inputs,
                response:  succeeded ? `Email delivered to ${to}` : (gmailResult.error ?? "Unknown error"),
                timestamp: new Date().toISOString(),
              };
            } else {
              resultMsg = "⚠ Gmail not connected. Please connect Google in the Tools tab.";
              result = { name: tool.tool_name, status: "failed", data: toolCallParsed.inputs, response: "Google account not connected", timestamp: new Date().toISOString() };
            }

          } else {
            reply = reply.replace(raw, "");
            continue;
          }

          req.log.info({ toolId: tool.id, connector: tool.connector, status: result.status }, "tool execution complete");
          toolCallResults.push(result);
          reply = reply.replace(raw, resultMsg ? `[${resultMsg}]` : "");

        } catch (parseErr) {
          logger.error({ parseErr }, "failed to parse tool call JSON — removing marker");
          reply = reply.replace(raw, "");
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    req.log.info({ provider: resolvedProvider, model: resolvedModel, hasDocContext: docContext.length > 0 }, "chat completion successful");

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
