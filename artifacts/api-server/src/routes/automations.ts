import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import Groq from "groq-sdk";

const router = Router();

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an automation workflow analyzer for an AI agent platform. A user will describe what they want to automate.

Your job is to extract a structured automation definition from their description.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation. Just raw JSON:
{
  "name": "Website Lead Capture",
  "description": "When a new lead fills the website form, save their info to Google Sheets and notify via Telegram",
  "trigger_type": "form_submission",
  "actions": ["google_sheets", "telegram"]
}

Rules:
- "name": short, descriptive name (3-6 words)
- "description": one clear sentence explaining what the automation does
- "trigger_type": one of: form_submission, webhook, schedule, new_email, manual
- "actions": array of connectors involved, chosen from: google_sheets, telegram, gmail, whatsapp, notion, slack, airtable

Pick the most appropriate trigger_type and actions based on what the user described.`;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface AutomationAnalyzeBody {
  description?: string;
  apiKey?: string;
  provider?: string;
}

interface AutomationResult {
  name: string;
  description: string;
  trigger_type: string;
  actions: string[];
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/automations/analyze", async (req: Request, res: Response) => {
  const { description, apiKey, provider } = req.body as AutomationAnalyzeBody;

  if (!description?.trim()) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required — add a key in Settings" });
    return;
  }

  req.log.info({ provider, descLength: description.length }, "automation analyze request received");

  let rawJson = "";

  try {
    if (provider === "groq") {
      const client = new Groq({ apiKey });
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: description.trim() },
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
          { role: "user", content: description.trim() },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      rawJson = completion.choices[0]?.message?.content ?? "{}";
    }

    const cleaned = rawJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(cleaned) as AutomationResult;

    req.log.info(
      { name: result.name, triggerType: result.trigger_type, actions: result.actions },
      "automation analyze successful"
    );
    res.json({ automation: result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, provider }, "automation analyze failed");

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
