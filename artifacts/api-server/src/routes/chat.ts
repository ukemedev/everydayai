import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

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
  const { message, instructions, model, provider, apiKey, conversationHistory, agentId } =
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

  // Fetch and inject knowledge base documents
  let docContext = "";
  if (agentId?.trim()) {
    try {
      docContext = await buildDocumentContext(agentId.trim());
    } catch (err) {
      logger.error({ err, agentId }, "buildDocumentContext threw unexpectedly");
    }
  }

  const systemPrompt = baseInstructions + docContext;

  req.log.info(
    { systemPromptLength: systemPrompt.length, docContextLength: docContext.length },
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
