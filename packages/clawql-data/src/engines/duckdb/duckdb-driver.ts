/** DuckDB driver (`@duckdb/node-api`) — implementation detail of the `duckdb` engine plugin. */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DuckDBConnection, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import type { DataQueryOk } from "../types.js";

export const DUCKDB_QUERY_HINT =
  "NULL semantic bools mean UNKNOWN, not absence. Do not conclude 0/N from WHERE col=false when many rows are NULL — query open_facts and/or read docs. " +
  "Pattern G: filter practice_area first, then JOIN matter_documents (doc_type / key_terms). " +
  "Examples: SELECT matter_id FROM matters WHERE is_hsr_second_request; " +
  "SELECT json_extract_string(d.key_terms, '$.lock_up_period_days') FROM matter_documents d WHERE d.doc_type = 'lock-up-agreement';";

export function resolveDuckDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_DATA_PATH?.trim();
  if (explicit) return explicit;
  const vault = env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
  if (vault) return `${vault.replace(/\/+$/, "")}/lab/matters.duckdb`;
  return ":memory:";
}

export function maxQueryRows(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.CLAWQL_DATA_SQL_MAX_ROWS ?? "500", 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export function maxCellChars(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.CLAWQL_DATA_SQL_MAX_CELL_CHARS ?? "2000", 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

export type DuckDbHandle = {
  readonly path: string;
  readonly instance: DuckDBInstance;
  readonly connection: DuckDBConnection;
};

export async function openDuckDb(path: string): Promise<DuckDbHandle> {
  if (path && path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  return { path, instance, connection };
}

export async function runSql(
  handle: DuckDbHandle,
  sql: string,
  params?: readonly unknown[]
): Promise<void> {
  if (params && params.length > 0) {
    await handle.connection.run(sql, params as DuckDBValue[]);
    return;
  }
  await handle.connection.run(sql);
}

function serializeCell(value: unknown, maxChars: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : JSON.parse(s);
    } catch {
      const s = String(value);
      return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : s;
    }
  }
  const s = String(value);
  return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : s;
}

export async function queryDuckDb(
  handle: DuckDbHandle,
  sql: string,
  options: { maxRows?: number; maxChars?: number } = {}
): Promise<DataQueryOk> {
  const maxRows = options.maxRows ?? 500;
  const maxChars = options.maxChars ?? 2000;
  const reader = await handle.connection.runAndReadAll(sql);
  const objects = reader.getRowObjectsJson() as Record<string, unknown>[];
  const truncated = objects.length > maxRows;
  const sliced = objects.slice(0, maxRows);
  const columns = sliced.length > 0 ? Object.keys(sliced[0]!) : (reader.columnNames() as string[]);
  const rows = sliced.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      out[col] = serializeCell(row[col], maxChars);
    }
    return out;
  });
  return {
    ok: true,
    engine: "duckdb",
    sql,
    columns,
    rows,
    rowCount: rows.length,
    truncated,
    hint: DUCKDB_QUERY_HINT,
  };
}

export async function closeDuckDb(handle: DuckDbHandle): Promise<void> {
  try {
    handle.connection.closeSync();
  } catch {
    /* already closed */
  }
  try {
    handle.instance.closeSync();
  } catch {
    /* already closed */
  }
}
