// ─── textExtractor.test.ts ────────────────────────────────────────────
// TDD TESTS for lib/textExtractor.ts
//
// WHY these exist:
// → Proves extractText decodes plain text buffers correctly
// → Proves extractText calls pdf-parse for PDF buffers
// → Proves extractText calls mammoth for DOCX buffers
// → Proves extractText returns empty string for empty text buffer
// → Proves extractText throws for unsupported MIME types
// → These tests seal the text extraction behaviour forever
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { extractText } from "../lib/textExtractor.js";

vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "extracted pdf text" }),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: "extracted docx text" }),
}));

// ── plain text ────────────────────────────────────────────────────────

describe("extractText — plain text", () => {

  it("✅ decodes a plain text buffer as UTF-8", async () => {
    const buffer = Buffer.from("hello world", "utf-8");
    const result = await extractText(buffer, "text/plain");
    expect(result).toBe("hello world");
  });

  it("✅ returns empty string for empty text buffer", async () => {
    const buffer = Buffer.from("", "utf-8");
    const result = await extractText(buffer, "text/plain");
    expect(result).toBe("");
  });

  it("✅ preserves unicode characters", async () => {
    const buffer = Buffer.from("Héllo Wörld", "utf-8");
    const result = await extractText(buffer, "text/plain");
    expect(result).toBe("Héllo Wörld");
  });

});

// ── PDF ───────────────────────────────────────────────────────────────

describe("extractText — PDF", () => {

  it("✅ returns extracted text from a PDF buffer", async () => {
    const buffer = Buffer.from("fake-pdf-bytes");
    const result = await extractText(buffer, "application/pdf");
    expect(result).toBe("extracted pdf text");
  });

});

// ── DOCX ──────────────────────────────────────────────────────────────

describe("extractText — DOCX", () => {

  it("✅ returns extracted text from a DOCX buffer", async () => {
    const buffer = Buffer.from("fake-docx-bytes");
    const result = await extractText(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result).toBe("extracted docx text");
  });

});

// ── unsupported type ──────────────────────────────────────────────────

describe("extractText — unsupported type", () => {

  it("✅ throws for an unsupported MIME type", async () => {
    const buffer = Buffer.from("some bytes");
    await expect(extractText(buffer, "image/png")).rejects.toThrow();
  });

});
