import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Public endpoint – no authentication required.
// Only exposes messages for conversations with channel = "test".
router.get("/public/conversations/:id/messages", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: conv } = await sb
    .from("conversations")
    .select("id, channel")
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv as { channel: string }).channel !== "test") {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const { data: msgs, error: msgErr } = await sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgErr) {
    res.status(500).json({ error: "Failed to load messages" });
    return;
  }

  res.json({ messages: msgs ?? [] });
});

export default router;
