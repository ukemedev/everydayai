import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// ─── Supabase service-role client (server-side only) ──────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Document context builder ─────────────────────────────────────────────────

interface DocRecord {
  file_name: string;
  file_type: string | null;
  storage_path: string | null;
}

async function extractText(buffer: Buffer, fileType: string | null): Promise<string> {
  const ext = (fileType ?? "").toLowerCase().replace(".", "");

  if (ext === "txt") {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf") {
    try {
      // dynamic import avoids pdf-parse test-file side-effect at module load
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js" as string)).default as
        (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    } catch {
      return "[Could not extract PDF text]";
    }
  }

  if (ext === "docx") {
    try {
      const mammoth = (await import("mammoth")).default as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return "[Could not extract DOCX text]";
    }
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
    try {
      const { data: fileData, error: dlErr } = await sb.storage
        .from("documents")
        .download(doc.storage_path);

      if (dlErr || !fileData) continue;

      const arrayBuf = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const text = await extractText(buffer, doc.file_type);

      sections.push(
        `--- Document: ${doc.file_name} ---\n${text.trim()}\n----------------------------`
      );
    } catch {
      // skip documents that fail to download/parse
    }
  }

  if (sections.length === 0) return "";

  return (
    "\n\nYou have access to the following knowledge base documents:\n\n" +
    sections.join("\n\n") +
    "\n\nUse these documents to answer questions accurately."
  );
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
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "No response from model.";
}

async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });
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
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ConversationMessage[],
  message: string
): Promise<string> {
  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response from model.";
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, provider, apiKey, conversationHistory, agentId } =
    req.body as ChatBody;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const resolvedModel = model?.trim() || "gpt-4o-mini";
  const resolvedProvider = provider?.trim() || "openai";
  const baseInstructions = instructions?.trim() || "You are a helpful assistant.";
  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? conversationHistory
    : [];

  req.log.info(
    { provider: resolvedProvider, model: resolvedModel, historyLength: history.length, agentId },
    "chat request received"
  );

  // Fetch and inject knowledge base context when agentId is provided
  let docContext = "";
  if (agentId?.trim()) {
    try {
      docContext = await buildDocumentContext(agentId.trim());
    } catch {
      // non-fatal — proceed without documents
    }
  }

  const systemPrompt = baseInstructions + docContext;

  try {
    let reply: string;

    switch (resolvedProvider) {
      case "anthropic":
        reply = await callAnthropic(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "google":
        reply = await callGoogle(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "groq":
        reply = await callGroq(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
      case "openai":
      default:
        reply = await callOpenAI(apiKey, resolvedModel, systemPrompt, history, message.trim());
        break;
    }

    req.log.info(
      { provider: resolvedProvider, model: resolvedModel, hasDocContext: docContext.length > 0 },
      "chat completion successful"
    );
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
