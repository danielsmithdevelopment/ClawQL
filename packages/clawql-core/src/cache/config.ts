/** `CLAWQL_CACHE_MAX_VALUE_BYTES` (default 1 MiB, max 16 MiB, min 1). */
export function getClawqlCacheMaxValueBytes(): number {
  const v = process.env.CLAWQL_CACHE_MAX_VALUE_BYTES?.trim();
  if (!v) return 1024 * 1024;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 1024 * 1024;
  return Math.min(Math.max(n, 1), 16 * 1024 * 1024);
}

/** `CLAWQL_CACHE_MAX_ENTRIES` (default 10_000, min 1, max 10M). */
export function getClawqlCacheMaxEntries(): number {
  const v = process.env.CLAWQL_CACHE_MAX_ENTRIES?.trim();
  if (!v) return 10_000;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 10_000;
  return Math.min(Math.max(n, 1), 10_000_000);
}
