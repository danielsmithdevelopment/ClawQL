const SQL_FORBIDDEN =
  /\b(insert|update|delete|drop|alter|attach|copy|export|install|load|pragma|create\s+or\s+replace|create\s+table|create\s+view|create\s+schema|grant|revoke|call|execute|vacuum)\b/i;

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
  const head = stripped.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  if (!["select", "with", "describe", "show", "summarize"].includes(head)) {
    throw new Error("query must start with SELECT, WITH, DESCRIBE, SHOW, or SUMMARIZE");
  }
  return stripped;
}
