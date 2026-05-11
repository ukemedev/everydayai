import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanFinding {
  filePath: string;
  line: number;
  issue: string;
  severity: "critical" | "warning";
}

export interface ScanSummary {
  findings: ScanFinding[];
  totalFiles: number;
  critical: number;
  warnings: number;
}

// ── Supabase ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegramReport(summary: ScanSummary, date: string): Promise<void> {
  const token  = process.env.DEVBOT_TELEGRAM_TOKEN;
  const chatId = process.env.DEVBOT_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  let text: string;

  if (summary.findings.length === 0) {
    text = `✅ EverydayAI Nightly Scan — All clear! No issues found.\n📅 ${date}\nTotal files scanned: ${summary.totalFiles}`;
  } else {
    const criticals = summary.findings.filter((f) => f.severity === "critical");
    const warnings  = summary.findings.filter((f) => f.severity === "warning");

    const formatLine = (f: ScanFinding) =>
      `• ${f.filePath.split("/").slice(-2).join("/")} line ${f.line}: ${f.issue}`;

    const parts: string[] = [
      `🔍 EverydayAI Nightly Scan Report`,
      `📅 ${date}`,
      ``,
      `🚨 Critical: ${summary.critical}`,
      `⚠️ Warnings: ${summary.warnings}`,
    ];

    if (criticals.length > 0) {
      parts.push(``, `CRITICAL ISSUES:`);
      criticals.slice(0, 10).forEach((f) => parts.push(formatLine(f)));
    }

    if (warnings.length > 0) {
      parts.push(``, `WARNINGS:`);
      warnings.slice(0, 15).forEach((f) => parts.push(formatLine(f)));
    }

    parts.push(``, `Total files scanned: ${summary.totalFiles}`);
    text = parts.join("\n");
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    logger.warn({ err }, "devbotScanner: telegram report failed");
  }
}

// ── Scanner 1 — Hardcoded secrets ─────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(?:^|[^a-z])sk-[A-Za-z0-9]{20,}/m,                     label: "Possible OpenAI/Stripe secret key (sk-...)" },
  { re: /ghp_[A-Za-z0-9]{36}/m,                                  label: "GitHub personal access token (ghp_...)" },
  { re: /(?:password|passwd)\s*=\s*['"][^'"]{4,}['"]/i,          label: "Hardcoded password assignment" },
  { re: /(?:apiKey|api_key)\s*=\s*['"][^'"]{8,}['"]/i,           label: "Hardcoded API key assignment" },
  { re: /(?:secret)\s*=\s*['"][^'"]{8,}['"]/i,                   label: "Hardcoded secret assignment" },
  { re: /API_KEY\s*=\s*['"][^'"]{8,}['"]/,                       label: "Hardcoded API_KEY value" },
  { re: /Authorization:\s*`Bearer\s+[^$`]{8,}`/,                 label: "Hardcoded Bearer token (not a variable)" },
];

export function scanForHardcodedSecrets(content: string, filePath: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments and env lookups
    if (/^\s*(\/\/|#|\*)/.test(line)) continue;
    if (/process\.env/.test(line)) continue;

    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(line)) {
        findings.push({ filePath, line: i + 1, issue: label, severity: "critical" });
        break; // one finding per line
      }
    }
  }

  return findings;
}

// ── Scanner 2 — Unprotected routes ────────────────────────────────────────────

const ROUTE_DEF = /router\.(get|post|put|delete|patch)\s*\(\s*["'`]/;
const AUTH_GUARD = /requireAdmin|requireAuth|adminAuth|isAdmin/;

export function scanForUnprotectedRoutes(content: string, filePath: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!ROUTE_DEF.test(line)) continue;

    // Check 3 lines around the route definition for auth guard
    const window = lines.slice(Math.max(0, i - 1), i + 4).join("\n");
    if (!AUTH_GUARD.test(window)) {
      const match = line.match(/router\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)/);
      const endpoint = match ? `${match[1].toUpperCase()} ${match[2]}` : "route";
      findings.push({
        filePath,
        line: i + 1,
        issue: `Possibly unprotected route: ${endpoint}`,
        severity: "warning",
      });
    }
  }

  return findings;
}

// ── Scanner 3 — Missing error handlers ───────────────────────────────────────

const ASYNC_HANDLER = /async\s*\(req[^)]*,\s*res[^)]*\)/;
const HAS_AWAIT     = /\bawait\b/;
const HAS_TRY_CATCH = /\btry\s*\{/;

export function scanForMissingErrorHandlers(content: string, filePath: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!ASYNC_HANDLER.test(line)) continue;

    // Grab up to 40 lines of this handler body
    const bodyLines = lines.slice(i, i + 40);
    const body = bodyLines.join("\n");

    if (HAS_AWAIT.test(body) && !HAS_TRY_CATCH.test(body)) {
      findings.push({
        filePath,
        line: i + 1,
        issue: "Async route handler uses await without try/catch",
        severity: "warning",
      });
    }
  }

  return findings;
}

// ── File collector ────────────────────────────────────────────────────────────

async function collectFiles(dir: string, exts: string[]): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const sub = await collectFiles(full, exts);
          results.push(...sub);
        } else if (exts.some((ext) => entry.name.endsWith(ext))) {
          results.push(full);
        }
      })
    );
  } catch {
    // Directory doesn't exist — skip silently
  }
  return results;
}

// ── runFullScan ───────────────────────────────────────────────────────────────

export async function runFullScan(): Promise<ScanSummary> {
  const cwd = process.cwd(); // artifacts/api-server

  const backendRoutesDir = path.resolve(cwd, "src", "routes");
  const frontendSrcDir   = path.resolve(cwd, "..", "everydayai", "src");

  const [backendFiles, frontendFiles] = await Promise.all([
    collectFiles(backendRoutesDir, [".ts"]),
    collectFiles(frontendSrcDir,   [".ts", ".tsx"]),
  ]);

  const allFiles = [...backendFiles, ...frontendFiles];
  const allFindings: ScanFinding[] = [];

  await Promise.all(
    allFiles.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const rel = path.relative(cwd, filePath).replace(/\\/g, "/");

        // Only run secrets + unprotected route checks on backend; all 3 on frontend
        const isBackend = filePath.includes("api-server");
        const findings = [
          ...scanForHardcodedSecrets(content, rel),
          ...(isBackend ? scanForUnprotectedRoutes(content, rel) : []),
          ...(isBackend ? scanForMissingErrorHandlers(content, rel) : []),
        ];

        allFindings.push(...findings);
      } catch { /* skip unreadable files */ }
    })
  );

  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const warnings  = allFindings.filter((f) => f.severity === "warning").length;
  const date = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";

  // Save to Supabase
  const sb = getServiceClient();
  if (sb && allFindings.length > 0) {
    try {
      await sb.from("devbot_scan_results").insert(
        allFindings.map((f) => ({
          file_path:   f.filePath,
          line_number: f.line,
          issue:       f.issue,
          severity:    f.severity,
        }))
      );
    } catch (err) {
      logger.warn({ err }, "devbotScanner: failed to save findings to Supabase");
    }
  }

  const summary: ScanSummary = { findings: allFindings, totalFiles: allFiles.length, critical, warnings };

  logger.info({ totalFiles: allFiles.length, critical, warnings }, "devbot full scan complete");

  // Send Telegram report (fire-and-forget)
  void sendTelegramReport(summary, date);

  return summary;
}
