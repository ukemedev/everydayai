import { logger } from "./logger.js";

export interface TableStats {
  table: string;
  rowCount: number;
  sizeBytes?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
}

export async function getSchema(): Promise<Record<string, string[]>> {
  logger.info("devbotDatabase: getSchema called");
  return {};
}

export async function runQuery(sql: string): Promise<QueryResult> {
  logger.info({ sql: sql.slice(0, 100) }, "devbotDatabase: runQuery called");
  return { rows: [], rowCount: 0, duration: 0 };
}

export async function getTableStats(): Promise<TableStats[]> {
  logger.info("devbotDatabase: getTableStats called");
  return [];
}
