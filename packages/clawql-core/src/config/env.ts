/** Parse a bounded integer from an env string with fallback when missing or invalid. */
export function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const v = raw?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** `CLAWQL_AUDIT_MAX_ENTRIES` (default 500, min 1, max 50_000). */
export function getClawqlAuditMaxEntries(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(env.CLAWQL_AUDIT_MAX_ENTRIES, 500, 1, 50_000);
}

/** `CLAWQL_CACHE_MAX_VALUE_BYTES` (default 1 MiB, max 16 MiB, min 1). */
export function getClawqlCacheMaxValueBytes(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(env.CLAWQL_CACHE_MAX_VALUE_BYTES, 1024 * 1024, 1, 16 * 1024 * 1024);
}

/** `CLAWQL_CACHE_MAX_ENTRIES` (default 10_000, min 1, max 10M). */
export function getClawqlCacheMaxEntries(env: NodeJS.ProcessEnv = process.env): number {
  return parseBoundedInt(env.CLAWQL_CACHE_MAX_ENTRIES, 10_000, 1, 10_000_000);
}

/** `CLAWQL_CUCKOO_METRICS=1` enables in-process Cuckoo observability counters. */
export function isClawqlCuckooMetricsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_CUCKOO_METRICS?.trim() === "1";
}

export type ClawqlCoreEnvConfig = {
  readonly auditMaxEntries: number;
  readonly cacheMaxValueBytes: number;
  readonly cacheMaxEntries: number;
  readonly cuckooMetricsEnabled: boolean;
};

/** Snapshot of all clawql-core env-backed settings (re-reads env on each accessor via service). */
export function readClawqlCoreEnvConfig(env: NodeJS.ProcessEnv = process.env): ClawqlCoreEnvConfig {
  return {
    auditMaxEntries: getClawqlAuditMaxEntries(env),
    cacheMaxValueBytes: getClawqlCacheMaxValueBytes(env),
    cacheMaxEntries: getClawqlCacheMaxEntries(env),
    cuckooMetricsEnabled: isClawqlCuckooMetricsEnabled(env),
  };
}
