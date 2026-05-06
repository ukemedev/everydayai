import { Router } from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";

const router = Router();

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

router.post("/chat", async (req: Request, res: Response) => {
  const { message, instructions, model, conversationHistory } = req.body as {
    message?: string;
    instructions?: string;
    model?: string;
    conversationHistory?: ConversationMessage[];
    agentId?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const resolvedModel = model?.trim() || "gpt-4o-mini";
  const systemPrompt = instructions?.trim() || "You are a helpful assistant.";
  const history: ConversationMessage[] = Array.isArray(conversationHistory)
    ? conversationHistory
    : [];

  req.log.info(
    { model: resolvedModel, historyLength: history.length, hasInstructions: !!instructions?.trim() },
    "chat request received"
  );

  try {
    const client = getClient();

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message.trim() },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "No response from model.";
    req.log.info({ model: resolvedModel }, "chat completion successful");
    res.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, model: resolvedModel }, "chat completion failed");

    if (message.includes("OPENAI_API_KEY")) {
      res.status(500).json({ error: "OpenAI API key is not configured on the server." });
    } else {
      res.status(500).json({ error: "Failed to get a response. Please try again." });
    }
  }
});

export default router;
