/** `CLAWQL_AUDIT_MAX_ENTRIES` (default 500, min 1, max 50_000). */
export function getClawqlAuditMaxEntries(): number {
  const v = process.env.CLAWQL_AUDIT_MAX_ENTRIES?.trim();
  if (!v) return 500;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 500;
  return Math.min(Math.max(n, 1), 50_000);
}
