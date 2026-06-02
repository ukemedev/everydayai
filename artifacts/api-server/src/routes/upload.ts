import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";
import { decrypt, isEncrypted } from "../lib/encryption.js";
import { transcribeAudio } from "../lib/whisper.js";
import { getUserPlan } from "../lib/planLimits.js";

// pdf-parse and mammoth are CJS — load via require at runtime
const _require  = createRequire(import.meta.url);
const pdfParse  = _require("pdf-parse") as (buf: Buffer, opts?: object) => Promise<{ text: string }>;
const mammoth   = _require("mammoth")   as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_ORDER = ["free", "starter", "pro", "business"];

function planAllows(ownerPlan: string, required: "starter" | "pro"): boolean {
  return PLAN_ORDER.indexOf(ownerPlan.toLowerCase()) >= PLAN_ORDER.indexOf(required);
}

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const IMAGE_MAX_BYTES      = 5  * 1024 * 1024;  //  5 MB
const VOICE_MAX_BYTES      = 25 * 1024 * 1024;  // 25 MB (Whisper limit)
const FILE_MAX_BYTES       = 10 * 1024 * 1024;  // 10 MB

// ─── Multer (in-memory, 25 MB cap — validated per type below) ─────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: VOICE_MAX_BYTES },
});

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── POST /api/upload ─────────────────────────────────────────────────────────
//
// Public endpoint (no JWT required) — agentId identifies the agent.
// Looks up the agent owner's plan to enforce capability gates.
//
// Body:   multipart/form-data { file, agentId, capability: "voice"|"image"|"file" }
// Gates:  voice → pro+   |  image → pro+   |  file → starter+
//
// Responses:
//   voice  → { type: "voice",  transcript: string }
//   image  → { type: "image",  base64: string, mimeType: string }
//   file   → { type: "file",   content: string, filename: string }

router.post(
  "/upload",
  upload.single("file") as RequestHandler,
  async (req: Request, res: Response) => {

    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const { agentId, capability } = req.body as { agentId?: string; capability?: string };

    if (!agentId?.trim()) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    if (!["voice", "image", "file"].includes(capability ?? "")) {
      res.status(400).json({ error: "capability must be voice, image, or file" });
      return;
    }

    const cap          = capability as "voice" | "image" | "file";
    const requiredPlan = cap === "file" ? "starter" : "pro";

    const sb = getServiceClient();
    if (!sb) { res.status(503).json({ error: "Service unavailable" }); return; }

    // ── Resolve agent → owner ─────────────────────────────────────────────────
    const { data: agent } = await sb
      .from("agents")
      .select("user_id, input_capabilities")
      .eq("id", agentId.trim())
      .maybeSingle();

    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const ownerId  = (agent as { user_id: string }).user_id;
    const agentCaps = ((agent as { input_capabilities?: { images?: boolean; voice?: boolean; files?: boolean } }).input_capabilities) ?? {};

    // ── Check that this capability is enabled for the agent ───────────────────
    const capEnabled =
      cap === "voice"  ? !!agentCaps.voice  :
      cap === "image"  ? !!agentCaps.images :
      !!agentCaps.files;

    if (!capEnabled) {
      res.status(403).json({
        error:   "CAPABILITY_DISABLED",
        message: "This capability is not enabled for this agent.",
      });
      return;
    }

    // ── Check owner plan ──────────────────────────────────────────────────────
    const ownerPlan = await getUserPlan(ownerId).catch(() => "free");
    if (!planAllows(ownerPlan, requiredPlan)) {
      res.status(403).json({
        error:    "PLAN_REQUIRED",
        required: requiredPlan,
        current:  ownerPlan,
        message:  `${cap} uploads require the ${requiredPlan} plan or higher.`,
      });
      return;
    }

    const { buffer, mimetype, originalname, size } = req.file;

    try {
      // ── Voice — transcribe with Whisper ──────────────────────────────────────
      if (cap === "voice") {
        if (size > VOICE_MAX_BYTES) {
          res.status(413).json({ error: "Audio too large. Maximum 25 MB." });
          return;
        }

        const { data: keyRow } = await sb
          .from("api_keys")
          .select("api_key")
          .eq("user_id", ownerId)
          .eq("provider", "openai")
          .maybeSingle();

        if (!keyRow?.api_key) {
          res.status(400).json({
            error:   "NO_OPENAI_KEY",
            message: "Voice transcription requires an OpenAI API key. Add one in Settings → API Keys.",
          });
          return;
        }

        const rawKey   = keyRow.api_key as string;
        const openaiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey;
        const transcript = await transcribeAudio(buffer, mimetype, openaiKey);

        res.json({ type: "voice", transcript });
        return;
      }

      // ── Image — return base64 for vision API ──────────────────────────────────
      if (cap === "image") {
        if (!ALLOWED_IMAGE_MIMES.has(mimetype)) {
          res.status(415).json({ error: "Unsupported image format. Use JPEG, PNG, GIF, or WebP." });
          return;
        }
        if (size > IMAGE_MAX_BYTES) {
          res.status(413).json({ error: "Image too large. Maximum 5 MB." });
          return;
        }

        const base64 = buffer.toString("base64");
        res.json({ type: "image", base64, mimeType: mimetype });
        return;
      }

      // ── File — extract plain text ─────────────────────────────────────────────
      if (size > FILE_MAX_BYTES) {
        res.status(413).json({ error: "File too large. Maximum 10 MB." });
        return;
      }

      const ext = originalname.split(".").pop()?.toLowerCase() ?? "";
      let content = "";

      if (ext === "pdf") {
        const result = await pdfParse(buffer);
        content = result.text;
      } else if (ext === "docx") {
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else if (ext === "txt") {
        content = buffer.toString("utf-8");
      } else {
        res.status(415).json({ error: "Unsupported file type. Use PDF, DOCX, or TXT." });
        return;
      }

      if (!content.trim()) {
        res.status(422).json({ error: "File appears to be empty or unreadable." });
        return;
      }

      res.json({ type: "file", content: content.slice(0, 50_000), filename: originalname });

    } catch (err) {
      logger.error({ err, cap, agentId }, "upload processing failed");
      res.status(500).json({ error: "Failed to process file. Please try again." });
    }
  }
);

export default router;
