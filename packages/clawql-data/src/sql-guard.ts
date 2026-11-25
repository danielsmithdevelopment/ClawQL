const SQL_FORBIDDEN =
  /\b(insert|update|delete|drop|alter|attach|copy|export|install|load|pragma|create\s+or\s+replace|create\s+table|create\s+view|create\s+schema|grant|revoke|call|execute|vacuum)\b/i;

/** Host / URL IO table functions and scans — backstop; DuckDB also locks external access (4.02). */
const SQL_EXTERNAL_IO =
  /\b(read_text|read_csv|read_csv_auto|read_json|read_json_auto|read_parquet|read_blob|read_binary|glob|httpfs|iceberg_scan|delta_scan|postgres_scan|sqlite_scan)\s*\(/i;

const SQL_PATH_OR_URL_SCAN =
  /\bfrom\s+['"](?:https?:|s3:|file:|\/|\.\/|\.\.\/|~\/)/i;

export function validateReadonlySelect(sql: string): string {
  const text = (sql || "").trim();
  if (!text) {
    throw new Error("sql is empty");
  }
  const stripped = text.replace(/;+\s*$/, "");
  if (stripped.includes(";")) {
    throw new Error("only a single SQL statement is allowed");
  }
  if (SQL_FORBIDDEN.test(stripped)) {
    throw new Error("read-only SELECT/WITH queries only");
  }
  if (SQL_EXTERNAL_IO.test(stripped) || SQL_PATH_OR_URL_SCAN.test(stripped)) {
    throw new Error("queries must not read host files or remote URLs");
  }
  const head = stripped.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  if (!["select", "with", "describe", "show", "summarize"].includes(head)) {
    throw new Error("query must start with SELECT, WITH, DESCRIBE, SHOW, or SUMMARIZE");
  }
  return stripped;
}
