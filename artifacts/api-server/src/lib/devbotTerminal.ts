import { exec } from "child_process";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

const execAsync = promisify(exec);

const WORKSPACE = "/home/runner/workspace";
const TIMEOUT_MS = 30_000;

// ── Security blacklist ────────────────────────────────────────────────────────

const BLACKLISTED_PATTERNS = [
  /rm\s+-rf/i,
  /DROP\s+TABLE/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /curl\s+.*\|\s*bash/i,
  /wget\s+.*\|\s*bash/i,
  />\s*\/dev\/(s?da|nvme)/i,
  /mkfs/i,
  /dd\s+if=/i,
];

function isBlacklisted(command: string): boolean {
  return BLACKLISTED_PATTERNS.some((re) => re.test(command));
}

// ── Supabase helper ───────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface TerminalLog {
  id: string;
  session_id: string;
  command: string;
  stdout: string | null;
  stderr: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  created_at: string;
}

// ── runCommand ────────────────────────────────────────────────────────────────

export async function runCommand(
  command: string,
  sessionId: string,
): Promise<CommandResult> {
  if (isBlacklisted(command)) {
    const result: CommandResult = {
      stdout: "",
      stderr: `🚫 Command blocked by security policy: "${command}"`,
      exitCode: 1,
      duration: 0,
    };
    await saveLog(sessionId, command, result);
    return result;
  }

  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const { stdout: out, stderr: err } = await execAsync(command, {
      cwd: WORKSPACE,
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1 MB
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    stdout = out ?? "";
    stderr = err ?? "";
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string };
    stdout = execErr.stdout ?? "";
    stderr = execErr.stderr ?? "";
    if (execErr.killed || execErr.signal === "SIGTERM") {
      stderr += "\n⏱ Command timed out after 30 seconds and was killed.";
    }
    exitCode = typeof execErr.code === "number" ? execErr.code : 1;
  }

  const duration = Date.now() - start;
  const result: CommandResult = { stdout, stderr, exitCode, duration };

  logger.info({ command, exitCode, duration }, "devbot terminal command executed");
  await saveLog(sessionId, command, result);
  return result;
}

async function saveLog(
  sessionId: string,
  command: string,
  result: CommandResult,
): Promise<void> {
  try {
    const sb = getServiceClient();
    const { error } = await sb.from("devbot_terminal_logs").insert({
      session_id: sessionId,
      command,
      stdout: result.stdout || null,
      stderr: result.stderr || null,
      exit_code: result.exitCode,
      duration_ms: result.duration,
    });
    if (error) logger.warn({ err: error }, "devbotTerminal: saveLog failed");
  } catch (err) {
    logger.warn({ err }, "devbotTerminal: saveLog threw");
  }
}

// ── getSafePackageInfo ────────────────────────────────────────────────────────

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  weeklyDownloads?: number;
}

export async function getSafePackageInfo(packageName: string): Promise<PackageInfo | null> {
  const safe = /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/.test(packageName);
  if (!safe) return null;

  try {
    const { stdout } = await execAsync(`npm info ${packageName} --json`, {
      cwd: WORKSPACE,
      timeout: 15_000,
    });
    const info = JSON.parse(stdout) as Record<string, unknown>;
    return {
      name: (info["name"] as string) ?? packageName,
      version: (info["dist-tags"] as Record<string, string>)?.["latest"] ?? (info["version"] as string) ?? "unknown",
      description: (info["description"] as string) ?? "",
      weeklyDownloads: undefined,
    };
  } catch {
    return null;
  }
}

// ── getTerminalLogs ───────────────────────────────────────────────────────────

export async function getTerminalLogs(): Promise<TerminalLog[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("devbot_terminal_logs")
    .select("id, session_id, command, stdout, stderr, exit_code, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as TerminalLog[];
}
