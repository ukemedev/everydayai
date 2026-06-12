import { Router } from "express";
import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── POST /api/onboarding/mark-tested ─────────────────────────────────────────
// Called when the user sends their first in-browser test message.
// Sets has_tested_chat = true AND appends "test_agent" to completed_steps.

router.post("/onboarding/mark-tested", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  // Fetch current completed_steps first
  const { data: profile } = await sb
    .from("profiles")
    .select("completed_steps")
    .eq("id", userId)
    .single();

  const current: string[] = Array.isArray((profile as { completed_steps?: string[] } | null)?.completed_steps)
    ? (profile as { completed_steps: string[] }).completed_steps
    : [];

  const updated = current.includes("test_agent") ? current : [...current, "test_agent"];

  const { error } = await sb
    .from("profiles")
    .update({ has_tested_chat: true, completed_steps: updated })
    .eq("id", userId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ─── PATCH /api/onboarding/complete-step ──────────────────────────────────────
// Append a step id to completed_steps (idempotent).

router.patch("/onboarding/complete-step", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { stepId } = req.body as { stepId?: string };
  if (!stepId?.trim()) {
    res.status(400).json({ error: "stepId is required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: profile } = await sb
    .from("profiles")
    .select("completed_steps")
    .eq("id", userId)
    .single();

  const current: string[] = Array.isArray((profile as { completed_steps?: string[] } | null)?.completed_steps)
    ? (profile as { completed_steps: string[] }).completed_steps
    : [];

  const updated = current.includes(stepId) ? current : [...current, stepId];

  const { error } = await sb
    .from("profiles")
    .update({ completed_steps: updated })
    .eq("id", userId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ─── PATCH /api/onboarding/remove-step ────────────────────────────────────────
// Remove a step id from completed_steps.

router.patch("/onboarding/remove-step", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { stepId } = req.body as { stepId?: string };
  if (!stepId?.trim()) {
    res.status(400).json({ error: "stepId is required" });
    return;
  }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { data: profile } = await sb
    .from("profiles")
    .select("completed_steps")
    .eq("id", userId)
    .single();

  const current: string[] = Array.isArray((profile as { completed_steps?: string[] } | null)?.completed_steps)
    ? (profile as { completed_steps: string[] }).completed_steps
    : [];

  const updated = current.filter((s) => s !== stepId);

  const { error } = await sb
    .from("profiles")
    .update({ completed_steps: updated })
    .eq("id", userId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ─── POST /api/onboarding/complete ────────────────────────────────────────────
// Called when the user dismisses the checklist or finishes all steps.
// Sets onboarding_complete = true — hides the card permanently.

router.post("/onboarding/complete", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sb = getServiceClient();
  if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

  const { error } = await sb
    .from("profiles")
    .update({ onboarding_complete: true })
    .eq("id", userId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

export default router;
