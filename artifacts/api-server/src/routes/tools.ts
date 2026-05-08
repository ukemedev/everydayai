import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { sanitizeText, validateMessageLength, detectPromptInjection } from "../lib/sanitize.js";

const router = Router();

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a tool analyzer for an AI agent platform. A user will describe what they want their agent to do.

Your job is to:
1. Identify which connector is needed (google_sheets, telegram, gmail, whatsapp, instagram)
2. Identify what action is needed (create_row, send_message, send_email, send_notification, post_content etc)
3. Identify what data the agent needs to collect from the user to make this work

Return ONLY a valid JSON object — no markdown, no code fences, no explanation. Just raw JSON:
{
  "connector": "google_sheets",
  "action": "create_row",
  "tool_name": "Save Lead to Sheet",
  "tool_description": "Saves customer name and phone number to Google Sheets",
  "required_inputs": [
    {
      "name": "customer_name",
      "label": "Customer Name",
      "description": "The full name of the customer"
    },
    {
      "name": "phone_number",
      "label": "Phone Number",
      "description": "Customer phone number"
    }
  ],
  "required_auth": {
    "type": "oauth",
    "provider": "google",
    "description": "Connect your Google account"
  }
}`;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ToolAnalyzeBody {
  description?: string;
  apiKey?: string;
  provider?: string;
}

interface ToolResult {
  connector: string;
  action: string;
  tool_name: string;
  tool_description: string;
  required_inputs: { name: string; label: string; description: string }[];
  required_auth: { type: string; provider: string; description: string };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/tools/analyze", async (req: Request, res: Response) => {
  const { description, apiKey, provider } = req.body as ToolAnalyzeBody;

  if (!description?.trim()) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required — add a Groq or OpenAI key in Settings" });
    return;
  }

  const cleanDescription = sanitizeText(description);

  if (!validateMessageLength(cleanDescription, 1000)) {
    res.status(400).json({ error: "Description is too long. Maximum 1000 characters." });
    return;
  }

  if (detectPromptInjection(cleanDescription)) {
    console.warn("Prompt injection attempt:", {
      ip: req.ip,
      message: cleanDescription.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
    req.log.warn({ ip: req.ip }, "Prompt injection detected in tools/analyze");
    res.status(400).json({ error: "Invalid message content" });
    return;
  }

  req.log.info({ provider, descLength: cleanDescription.length }, "tool analyze request received");

  let rawJson = "";

  try {
    if (provider === "groq") {
      const client = new Groq({ apiKey });
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: cleanDescription },
        ],
        temperature: 0.1,
      });
      rawJson = completion.choices[0]?.message?.content ?? "{}";
    } else {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: cleanDescription },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      rawJson = completion.choices[0]?.message?.content ?? "{}";
    }

    // Strip any markdown fences a model might add despite instructions
    const cleaned = rawJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(cleaned) as ToolResult;

    req.log.info(
      { connector: result.connector, action: result.action, toolName: result.tool_name },
      "tool analyze successful"
    );
    res.json({ tool: result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, provider }, "tool analyze failed");

    if (errMsg.toLowerCase().includes("api key") || errMsg.includes("401") || errMsg.includes("authentication")) {
      res.status(401).json({ error: "Invalid API key. Please check your key in Settings." });
    } else if (errMsg.includes("JSON") || errMsg.includes("parse")) {
      res.status(422).json({ error: "AI returned an unexpected format. Please try again." });
    } else if (errMsg.toLowerCase().includes("rate limit") || errMsg.includes("429")) {
      res.status(429).json({ error: "Rate limit exceeded. Try again in a moment." });
    } else {
      res.status(500).json({ error: "Analysis failed. Please try again." });
    }
  }
});

export default router;
