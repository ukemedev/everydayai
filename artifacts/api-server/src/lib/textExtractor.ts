// ─── textExtractor.ts ─────────────────────────────────────────────────
// Extracts plain text from file buffers by MIME type.
//
// WHY this exists:
// → Single place for all text extraction logic
// → Used by documents route to enforce char count limits
// → Supports: text/plain, application/pdf, application/vnd...docx
// ─────────────────────────────────────────────────────────────────────

const PDF_MIME  = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TXT_MIME  = "text/plain";

/**
 * Extracts raw text from a file buffer.
 * @param buffer   - The raw file bytes
 * @param mimeType - The MIME type of the file
 * @returns        - Extracted text string
 * @throws         - If the MIME type is not supported
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  switch (mimeType) {
    case TXT_MIME:
      return buffer.toString("utf-8");

    case PDF_MIME: {
      const { default: pdfParse } = await import("pdf-parse");
      const result = await pdfParse(buffer);
      return result.text;
    }

    case DOCX_MIME: {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default:
      throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
  }
}
