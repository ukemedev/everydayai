import xss from "xss";
import validator from "validator";

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+all\s+instructions/i,
  /you\s+are\s+now\b/i,
  /forget\s+your\s+instructions/i,
  /forget\s+everything/i,
  /\bact\s+as\b/i,
  /pretend\s+you\s+are/i,
  /pretend\s+to\s+be/i,
  /\bjailbreak\b/i,
  /\bdan\s+mode\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bbypass\b/i,
  /override\s+instructions/i,
  /new\s+instructions/i,
  /\bsystem\s+prompt\b/i,
];

/**
 * Strip HTML tags, null bytes, and excess whitespace from user input.
 */
export function sanitizeText(text: string): string {
  let clean = xss(text, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ["script", "style"] });
  clean = clean.replace(/\0/g, "");
  clean = clean.trim();
  return clean;
}

/**
 * Returns false if the text exceeds maxLength characters.
 */
export function validateMessageLength(text: string, maxLength: number): boolean {
  return text.length <= maxLength;
}

/**
 * Returns true if the text contains prompt injection patterns.
 */
export function detectPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Returns true if the string is a valid email address.
 */
export function sanitizeEmail(email: string): boolean {
  return validator.isEmail(email);
}

/**
 * Remove path traversal sequences and special characters from a filename.
 * Keeps alphanumeric, dash, underscore, and dot only.
 */
export function sanitizeFileName(filename: string): string {
  let clean = filename
    .replace(/\.\.[/\\]/g, "")
    .replace(/[^a-zA-Z0-9\-_.]/g, "");
  return clean;
}
