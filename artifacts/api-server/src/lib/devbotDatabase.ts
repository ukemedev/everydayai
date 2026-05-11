import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
}

export type SchemaMap = Record<string, ColumnInfo[]>;

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export interface TableStat {
  tableName: string;
  rowCount: number;
}

// ── Client ────────────────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── getSchema ─────────────────────────────────────────────────────────────────
// Uses a security-definer RPC to read information_schema without permission
// issues. Run this once in the Supabase SQL editor to create the function:
//
//   create or replace function get_table_schema()
//   returns table(table_name text, column_name text,
//                 data_type text, is_nullable text)
//   language sql security definer as $$
//     select table_name::text, column_name::text,
//            data_type::text, is_nullable::text
//     from information_schema.columns
//     where table_schema = 'public'
//     order by table_name, ordinal_position;
//   $$;

export async function getSchema(): Promise<SchemaMap> {
  const sb = getClient();

  const { data, error } = await sb.rpc("get_table_schema");

  if (error) {
    logger.warn({ err: error }, "devbotDatabase: get_table_schema RPC failed");
    throw new Error(
      "Schema fetch failed. Make sure the get_table_schema() function is created in Supabase. " +
      `Supabase error: ${(error as { message?: string }).message ?? String(error)}`
    );
  }

  const schema: SchemaMap = {};
  for (const row of (data ?? []) as Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>) {
    if (!schema[row.table_name]) schema[row.table_name] = [];
    schema[row.table_name]!.push({
      columnName: row.column_name,
      dataType:   row.data_type,
      isNullable: row.is_nullable,
    });
  }

  logger.info({ tables: Object.keys(schema).length }, "devbotDatabase: schema fetched");
  return schema;
}

// ── runQuery ──────────────────────────────────────────────────────────────────

export async function runQuery(sql: string): Promise<QueryResult> {
  const trimmed = sql.trim();

  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are allowed");
  }

  // Append LIMIT 50 if not already present
  const limited = /\bLIMIT\s+\d+/i.test(trimmed) ? trimmed : `${trimmed} LIMIT 50`;

  const sb = getClient();
  const start = Date.now();

  const { data, error } = await (sb as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc("execute_sql", { sql_query: limited });

  if (error) {
    // Fallback: try parsing the query table name and using the Supabase client
    logger.warn({ err: error }, "devbotDatabase: rpc execute_sql not available, using fallback");
    const tableMatch = limited.match(/FROM\s+["']?(\w+)["']?/i);
    if (!tableMatch) throw new Error("Could not determine table name from query");

    const tableName = tableMatch[1]!;
    const { data: fbData, error: fbError } = await sb
      .from(tableName)
      .select("*")
      .limit(50);

    if (fbError) throw fbError;

    const rows = (fbData ?? []) as Record<string, unknown>[];
    return { rows, rowCount: rows.length, executionTime: Date.now() - start };
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return { rows, rowCount: rows.length, executionTime: Date.now() - start };
}

// ── getTableStats ─────────────────────────────────────────────────────────────

const CORE_TABLES = [
  "users",
  "agents",
  "conversations",
  "messages",
  "automations",
  "blog_posts",
  "subscriptions",
  "profiles",
];

export async function getTableStats(): Promise<TableStat[]> {
  const sb = getClient();
  const stats: TableStat[] = [];

  await Promise.all(
    CORE_TABLES.map(async (tableName) => {
      try {
        const { count, error } = await sb
          .from(tableName)
          .select("*", { count: "exact", head: true });

        if (!error) {
          stats.push({ tableName, rowCount: count ?? 0 });
        }
      } catch {
        // Table doesn't exist — skip silently
      }
    })
  );

  stats.sort((a, b) => a.tableName.localeCompare(b.tableName));
  logger.info({ tables: stats.length }, "devbotDatabase: table stats fetched");
  return stats;
}
