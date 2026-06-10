import path from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ["pdf", "txt", "docx"] as const;
const MAX_SIZE_BYTES = 500 * 1024; // 500 KB

// DOCX is a ZIP-based format — file-type may return either the OOXML MIME or
// the generic zip MIME depending on the version; we accept both.
const EXPECTED_MIMES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  // txt has no magic bytes — content check is skipped for plain text
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationError {
  status: number;
  body: object;
}

// ── Core validator ────────────────────────────────────────────────────────────

/**
 * Validates a multer file upload in three stages:
 *  1. Size — rejects anything above 10 MB (413)
 *  2. Extension — only .pdf / .txt / .docx (415)
 *  3. Magic-byte content check — ensures the file bytes actually match the
 *     declared extension; skipped for .txt since plain text has no magic bytes.
 *
 * Returns null on success, or a { status, body } error object on failure.
 */
export async function validateUpload(
  file: Express.Multer.File
): Promise<ValidationError | null> {
  // ── 1. Size ────────────────────────────────────────────────────────────────
  if (file.size > MAX_SIZE_BYTES) {
    return { status: 413, body: { error: "FILE_TOO_LARGE", maxSize: "500KB" } };
  }

  // ── 2. Extension ───────────────────────────────────────────────────────────
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "") as string;
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      status: 415,
      body: { error: "FILE_TYPE_NOT_ALLOWED", allowed: ["pdf", "txt", "docx"] },
    };
  }

  // ── 3. Magic-byte content check (skip for plain text) ─────────────────────
  if (ext !== "txt") {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(file.buffer);
    const allowedMimes = EXPECTED_MIMES[ext] ?? [];

    if (!detected || !allowedMimes.includes(detected.mime)) {
      return { status: 415, body: { error: "FILE_CONTENT_MISMATCH" } };
    }
  }

  return null;
}

// ── Filename sanitiser ────────────────────────────────────────────────────────

/**
 * Returns a safe filename suitable for use in Supabase Storage paths:
 *  - Strips path-traversal sequences (../ and ..\)
 *  - Strips any remaining consecutive dots (..)
 *  - Replaces every character that is not a letter, digit, dot, dash,
 *    or underscore with an underscore
 *  - Truncates to 100 characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\.[/\\]/g, "")           // remove  ../  and  ..\
    .replace(/\.\./g, "")                // remove remaining ..
    .replace(/[^a-zA-Z0-9._-]/g, "_")   // only safe chars
    .slice(0, 100);                      // max 100 chars
}

// ── Char count validator ──────────────────────────────────────────────

const MAX_CHAR_COUNT = 50_000;

/**
 * Validates that extracted document text does not exceed 50,000 characters.
 * Returns null on success, or a { status, body } error object on failure.
 */
export function validateCharCount(charCount: number): ValidationError | null {
  if (charCount > MAX_CHAR_COUNT) {
    return {
      status: 413,
      body: { error: "DOCUMENT_TOO_LONG", maxChars: MAX_CHAR_COUNT },
    };
  }
  return null;
}
