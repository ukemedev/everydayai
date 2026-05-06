import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.post("/chat", (req: Request, res: Response) => {
  const { message, instructions, model } = req.body as {
    message?: string;
    instructions?: string;
    model?: string;
    agentId?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  req.log.info({ model, hasInstructions: !!instructions?.trim() }, "chat request received");

  res.json({
    reply: `This is a placeholder response to: "${message}". Connect OpenAI to get real replies.`,
  });
});

export default router;
