import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { appendToSheet } from "../lib/googleSheets.js";

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
      return `Tool ID: ${t.id}\nName: ${t.tool_name}\nDescription: ${t.tool_description ?? ""}\nConnector: ${t.connector}\nAction: ${t.action}\nRequired inputs:\n${inputs}`;
    })
    .join("\n\n---\n\n");

  const prompt = `

You have access to the following tools. When you have collected ALL required inputs from the user, output a tool call on its own line in EXACTLY this format (nothing else on that line), then continue with a friendly confirmation:

[TOOL_CALL:{"tool_id":"<id>","inputs":{"<field_name>":"<value>"},"spreadsheet_id":"<id>","sheet_name":"Sheet1"}]

To get the spreadsheet_id: ask the user for their Google Sheets URL and extract the ID (the part between /d/ and /edit or /view). The sheet_name is usually "Sheet1" unless the user specifies otherwise.

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

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, provider, apiKey, conversationHistory, agentId, userId } =
    req.body as ChatBody;

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }
  if (!apiKey?.trim()) { res.status(400).json({ error: "apiKey is required" }); return; }

  const resolvedModel    = model?.trim()    || "gpt-4o-mini";
  const resolvedProvider = provider?.trim() || "openai";
  const baseInstructions = instructions?.trim() || "You are a helpful assistant.";
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
      case "anthropic": reply = await callAnthropic(apiKey, resolvedModel, systemPrompt, history, message.trim()); break;
      case "google":    reply = await callGoogle   (apiKey, resolvedModel, systemPrompt, history, message.trim()); break;
      case "groq":      reply = await callGroq     (apiKey, resolvedModel, systemPrompt, history, message.trim()); break;
      case "openai":
      default:          reply = await callOpenAI   (apiKey, resolvedModel, systemPrompt, history, message.trim()); break;
    }

    // ── Tool call execution ───────────────────────────────────────────────────
    const toolCallMatch = reply.match(/\[TOOL_CALL:(\{.*?\})\]/s);
    if (toolCallMatch && agentTools.length > 0) {
      req.log.info({ raw: toolCallMatch[1] }, "tool call detected in AI response");
      try {
        const toolCall = JSON.parse(toolCallMatch[1]) as {
          tool_id: string;
          inputs: Record<string, string>;
          spreadsheet_id: string;
          sheet_name?: string;
        };

        const tool = agentTools.find((t) => t.id === toolCall.tool_id);

        if (tool && tool.connector === "google_sheets" && userId?.trim()) {
          const sb = getServiceClient();
          let resultMsg = "";

          if (sb) {
            const { data: integration } = await sb
              .from("integrations")
              .select("access_token")
              .eq("user_id", userId.trim())
              .eq("provider", "google")
              .maybeSingle();

            if (integration?.access_token) {
              // Build row in order of required_inputs
              const rowData = tool.required_inputs?.length
                ? tool.required_inputs.map((i) => toolCall.inputs[i.name] ?? "")
                : Object.values(toolCall.inputs);

              const sheetResult = await appendToSheet(
                integration.access_token as string,
                toolCall.spreadsheet_id,
                toolCall.sheet_name ?? "Sheet1",
                rowData
              );

              resultMsg = sheetResult.success
                ? "✓ Saved to Google Sheets"
                : `⚠ Could not save to Google Sheets: ${sheetResult.error}`;

              req.log.info(
                { toolId: toolCall.tool_id, success: sheetResult.success },
                "tool execution complete"
              );
            } else {
              resultMsg = "⚠ Google Sheets not connected. Please connect Google in the Tools tab.";
            }
          }

          reply = reply.replace(toolCallMatch[0], `[${resultMsg}]`);
        } else {
          // Unknown connector or no userId — just remove the marker
          reply = reply.replace(toolCallMatch[0], "");
        }
      } catch (parseErr) {
        logger.error({ parseErr }, "failed to parse tool call JSON — removing marker");
        reply = reply.replace(toolCallMatch[0], "");
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    req.log.info({ provider: resolvedProvider, model: resolvedModel, hasDocContext: docContext.length > 0 }, "chat completion successful");
    res.json({ reply });
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
