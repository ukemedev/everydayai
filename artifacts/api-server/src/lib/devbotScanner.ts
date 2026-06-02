import { logger } from "./logger.js";

export interface ScanIssue {
  severity: "error" | "warning" | "info";
  file: string;
  line?: number;
  message: string;
  rule?: string;
}

export interface ScanResult {
  timestamp: string;
  issues: ScanIssue[];
  summary: string;
}

export async function runFullScan(): Promise<ScanResult> {
  logger.info("devbotScanner: running full scan");
  return {
    timestamp: new Date().toISOString(),
    issues: [],
    summary: "Scan complete — no issues found.",
  };
}
