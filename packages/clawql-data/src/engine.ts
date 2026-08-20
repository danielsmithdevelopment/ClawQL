/**
 * Node DuckDB is the only structured-data engine in ClawQL.
 * chDB is a Python package and is not supported.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DuckDBConnection, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";

export type ClawqlDataEngineKind = "duckdb";

export type DataQueryOk = {
  readonly ok: true;
  readonly engine: ClawqlDataEngineKind;
  readonly sql: string;
  readonly columns: string[];
  readonly rows: Record<string, unknown>[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly hint: string;
};

export type DataQueryErr = {
  readonly ok: false;
  readonly engine?: ClawqlDataEngineKind;
  readonly sql?: string;
  readonly error: string;
};

export type DataQueryResult = DataQueryOk | DataQueryErr;

export const DATA_QUERY_HINT =
  "Engine is Node DuckDB (packages/clawql-data). NULL semantic bools mean UNKNOWN, not absence. " +
  "Do not conclude 0/N from WHERE col=false when many rows are NULL — query open_facts and/or read docs. " +
  "Pattern G: for Capital Markets / Restructuring / lock-up / withdrawal / DIP, filter practice_area first, then JOIN matter_documents " +
  "(filename / doc_type / json_extract_string(key_terms, '$.…')). Zero cohort → write a negative deliverable; never substitute credit-facility matters. " +
  "Examples: SELECT matter_id FROM matters WHERE is_hsr_second_request; " +
  "SELECT m.matter_id, d.filename, d.doc_type FROM matters m JOIN matter_documents d ON m.matter_id = d.matter_id " +
  "WHERE d.doc_type = 'lock-up-agreement' OR d.filename ILIKE '%lock-up%'; " +
  "SELECT json_extract_string(d.key_terms, '$.lock_up_period_days') FROM matter_documents d WHERE d.doc_type = 'lock-up-agreement';";

export function resolveDataEngine(env: NodeJS.ProcessEnv = process.env): ClawqlDataEngineKind {
  const raw = (env.CLAWQL_DATA_ENGINE ?? "duckdb").trim().toLowerCase();
  if (raw === "" || raw === "duckdb") return "duckdb";
  if (raw === "chdb" || raw === "clickhouse" || raw === "python" || raw === "python-duckdb") {
    throw new Error(
      `CLAWQL_DATA_ENGINE=${raw} is not supported. chDB and Python DuckDB are Python packages. ` +
        "ClawQL uses Node DuckDB in packages/clawql-data. Set CLAWQL_DATA_ENGINE=duckdb or omit it."
    );
  }
  throw new Error(`Unknown CLAWQL_DATA_ENGINE=${raw}; only duckdb is supported.`);
}

export function resolveDataPath(env: NodeJS.ProcessEnv = process.env): string {
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
    hint: DATA_QUERY_HINT,
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
