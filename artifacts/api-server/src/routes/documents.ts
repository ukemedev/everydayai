import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { validateUpload, sanitizeFilename } from "../lib/fileValidation.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

// Memory storage — file bytes live in req.file.buffer (never touch disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // hard cap at 10 MB
});

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── POST /api/documents/upload ───────────────────────────────────────────────
//
// Accepts:  multipart/form-data  { file: <binary>, agentId: <uuid> }
// Requires: Bearer JWT (requireAuth applied in routes/index.ts)
//
// Pipeline:
//   1. Multer parses the multipart body into req.file (in-memory buffer)
//   2. validateUpload checks size, extension, and magic bytes
//   3. Filename is sanitised before storage
//   4. File is uploaded to Supabase Storage via service-role key
//   5. A record is inserted into the documents table

router.post(
  "/documents/upload",
  upload.single("file") as RequestHandler,
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const { agent_id: agentId } = req.body as { agent_id?: string };
    if (!agentId?.trim()) {
      res.status(400).json({ error: "agent_id is required" });
      return;
    }

    // ── Validate ─────────────────────────────────────────────────────────────
    const validationError = await validateUpload(req.file);
    if (validationError) {
      req.log.warn(
        { fileName: req.file.originalname, size: req.file.size, error: validationError.body },
        "document upload rejected by validation"
      );
      res.status(validationError.status).json(validationError.body);
      return;
    }

    const sb = getServiceClient();
    if (!sb) {
      res.status(503).json({ error: "Service unavailable" });
      return;
    }

    // ── Sanitise filename & build storage path ────────────────────────────────
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const sanitizedName = sanitizeFilename(req.file.originalname);
    const storagePath = `${userId}/${agentId.trim()}/${Date.now()}_${sanitizedName}`;

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const { error: storageError } = await sb.storage
      .from("documents")
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (storageError) {
      req.log.error({ err: storageError, storagePath }, "storage upload failed");
      res.status(500).json({ error: "Upload failed" });
      return;
    }

    // ── Insert DB record ──────────────────────────────────────────────────────
    const { data: docRecord, error: dbError } = await sb
      .from("documents")
      .insert({
        agent_id:     agentId.trim(),
        user_id:      userId,
        file_name:    sanitizedName,
        file_size:    req.file.size,
        file_type:    ext,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (dbError) {
      // Roll back the storage upload so we don't leave orphaned files
      await sb.storage.from("documents").remove([storagePath]);
      req.log.error({ err: dbError, storagePath }, "db insert failed — storage rolled back");
      res.status(500).json({ error: "Failed to save document record" });
      return;
    }

    req.log.info(
      { userId, agentId: agentId.trim(), storagePath, fileName: sanitizedName, size: req.file.size },
      "document uploaded successfully"
    );

    void logAudit({
      user_id:     userId,
      action:      "document_uploaded",
      resource:    "document",
      resource_id: (docRecord as { id: string }).id,
      metadata:    { fileName: sanitizedName, agentId: agentId.trim(), size: req.file.size },
      req,
    });

    res.status(201).json({ document: docRecord });
  }
);

export default router;
