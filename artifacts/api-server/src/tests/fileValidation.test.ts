// ─── fileValidation.test.ts ───────────────────────────────────────────
// TDD TESTS for lib/fileValidation.ts
//
// WHY these exist:
// → Proves validateUpload rejects files over 500 KB
// → Proves validateUpload accepts files at or under 500 KB
// → Proves validateCharCount rejects text over 50,000 chars
// → Proves validateCharCount accepts text at or under 50,000 chars
// → Proves sanitizeFilename strips dangerous path sequences
// → These tests seal the upload guard behaviour forever
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateUpload,
  validateCharCount,
  sanitizeFilename,
} from "../lib/fileValidation.js";

// ── helper ────────────────────────────────────────────────────────────

function makeMockFile(
  filename: string,
  size: number,
  buffer: Buffer
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: filename,
    encoding: "7bit",
    mimetype: "text/plain",
    buffer,
    size,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  } as Express.Multer.File;
}

// ── validateUpload — size ─────────────────────────────────────────────

describe("validateUpload — size check", () => {

  it("✅ accepts a file under 500 KB", async () => {
    const buf = Buffer.alloc(1024); // 1 KB
    const file = makeMockFile("test.txt", buf.length, buf);
    const result = await validateUpload(file);
    expect(result).toBeNull();
  });

  it("✅ accepts a file at exactly 500 KB", async () => {
    const size = 500 * 1024;
    const buf = Buffer.alloc(size);
    const file = makeMockFile("test.txt", size, buf);
    const result = await validateUpload(file);
    expect(result).toBeNull();
  });

  it("✅ rejects a file at 500 KB + 1 byte with status 413", async () => {
    const size = 500 * 1024 + 1;
    const buf = Buffer.alloc(size);
    const file = makeMockFile("test.txt", size, buf);
    const result = await validateUpload(file);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(413);
  });

  it("✅ rejects with FILE_TOO_LARGE error code", async () => {
    const size = 1 * 1024 * 1024; // 1 MB — previously accepted, now rejected
    const buf = Buffer.alloc(size);
    const file = makeMockFile("test.txt", size, buf);
    const result = await validateUpload(file);
    expect(result?.body).toMatchObject({ error: "FILE_TOO_LARGE" });
  });

  it("✅ error body includes maxSize of 500KB", async () => {
    const size = 500 * 1024 + 1;
    const buf = Buffer.alloc(size);
    const file = makeMockFile("test.txt", size, buf);
    const result = await validateUpload(file);
    expect(result?.body).toMatchObject({ maxSize: "500KB" });
  });

});

// ── validateUpload — extension ────────────────────────────────────────

describe("validateUpload — extension check", () => {

  it("✅ rejects unsupported extension with status 415", async () => {
    const buf = Buffer.alloc(100);
    const file = makeMockFile("test.exe", 100, buf);
    const result = await validateUpload(file);
    expect(result?.status).toBe(415);
    expect(result?.body).toMatchObject({ error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("✅ rejects .csv files", async () => {
    const buf = Buffer.alloc(100);
    const file = makeMockFile("data.csv", 100, buf);
    const result = await validateUpload(file);
    expect(result?.status).toBe(415);
  });

});

// ── validateCharCount ─────────────────────────────────────────────────

describe("validateCharCount", () => {

  it("✅ returns null for 0 characters", () => {
    expect(validateCharCount(0)).toBeNull();
  });

  it("✅ returns null for exactly 50,000 characters", () => {
    expect(validateCharCount(50_000)).toBeNull();
  });

  it("✅ rejects 50,001 characters with status 413", () => {
    const result = validateCharCount(50_001);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(413);
  });

  it("✅ rejects with DOCUMENT_TOO_LONG error code", () => {
    const result = validateCharCount(100_000);
    expect(result?.body).toMatchObject({ error: "DOCUMENT_TOO_LONG" });
  });

  it("✅ includes maxChars: 50000 in error body", () => {
    const result = validateCharCount(50_001);
    expect(result?.body).toMatchObject({ maxChars: 50_000 });
  });

});

// ── sanitizeFilename ──────────────────────────────────────────────────

describe("sanitizeFilename", () => {

  it("✅ removes path traversal sequences", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("..");
  });

  it("✅ replaces spaces with underscores", () => {
    expect(sanitizeFilename("my file.pdf")).toBe("my_file.pdf");
  });

  it("✅ truncates to 100 characters", () => {
    const long = "a".repeat(200) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(100);
  });

});
