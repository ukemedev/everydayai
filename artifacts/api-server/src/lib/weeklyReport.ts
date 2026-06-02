import { logger } from "./logger.js";

export interface WeeklyReport {
  generatedAt: string;
  summary: string;
  sections: Record<string, unknown>;
}

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  logger.info("weeklyReport: generating weekly report");
  return {
    generatedAt: new Date().toISOString(),
    summary: "Weekly report not yet implemented.",
    sections: {},
  };
}

export async function sendWeeklyReportTelegram(_chatId: string): Promise<void> {
  logger.info({ chatId: _chatId }, "weeklyReport: sendWeeklyReportTelegram not yet implemented");
}
