/**
 * Layer 5 semantic cache on KV.
 * Phase 1: exact + normalized key lookup (embedding similarity can plug in later).
 * No execution metering — cache is an optimization, not a quota gate.
 */

export type CacheSetInput = {
  key: string;
  value: string;
  /** TTL seconds (default 3600, max 7d). */
  ttlSeconds?: number;
};

function normalizeCacheKey(tenantId: string, key: string): string {
  const clean = key.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500);
  return `l5:${tenantId}:${clean}`;
}

export async function cacheGet(
  kv: KVNamespace,
  tenantId: string,
  key: string
): Promise<{ hit: boolean; value: string | null; cacheKey: string }> {
  const cacheKey = normalizeCacheKey(tenantId, key);
  const value = await kv.get(cacheKey);
  return { hit: value !== null, value, cacheKey };
}

export async function cacheSet(
  kv: KVNamespace,
  tenantId: string,
  input: CacheSetInput
): Promise<{ cacheKey: string; ttlSeconds: number }> {
  if (!input.key?.trim()) throw new Error("key is required");
  if (input.value === undefined || input.value === null) throw new Error("value is required");
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? 3600, 60), 604800);
  const cacheKey = normalizeCacheKey(tenantId, input.key);
  await kv.put(cacheKey, String(input.value), { expirationTtl: ttlSeconds });
  return { cacheKey, ttlSeconds };
}

export async function cacheDelete(kv: KVNamespace, tenantId: string, key: string): Promise<void> {
  await kv.delete(normalizeCacheKey(tenantId, key));
}

/** Lookup before a model/tool call; returns cached body on hit. */
export async function semanticCacheLookup(
  kv: KVNamespace,
  tenantId: string,
  promptOrQuery: string
): Promise<{ hit: true; value: string } | { hit: false }> {
  const { hit, value } = await cacheGet(kv, tenantId, promptOrQuery);
  if (hit && value !== null) return { hit: true, value };
  return { hit: false };
}
