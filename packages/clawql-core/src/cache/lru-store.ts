import { getClawqlCacheMaxEntries, getClawqlCacheMaxValueBytes } from "./config.js";
import type {
  CacheDeleteResult,
  CacheGetResult,
  CacheListResult,
  CacheOperationInput,
  CacheOperationResult,
  CacheSearchResult,
  CacheSetResult,
} from "./types.js";

export type LruCacheStore = {
  readonly getMaxValueBytes: () => number;
  readonly getMaxEntries: () => number;
  readonly execute: (input: CacheOperationInput) => CacheOperationResult;
  readonly reset: () => void;
};

function touchLru(mem: Map<string, string>, key: string): void {
  const v = mem.get(key);
  if (v === undefined) return;
  mem.delete(key);
  mem.set(key, v);
}

function evictLruUntilRoomForNewKey(mem: Map<string, string>, maxEntries: number): number {
  let evicted = 0;
  while (mem.size >= maxEntries) {
    const lru = mem.keys().next().value as string | undefined;
    if (lru === undefined) break;
    mem.delete(lru);
    evicted++;
  }
  return evicted;
}

function executeOnStore(
  mem: Map<string, string>,
  getMaxValueBytes: () => number,
  getMaxEntries: () => number,
  input: CacheOperationInput
): CacheOperationResult {
  const maxV = getMaxValueBytes();
  const maxEntries = getMaxEntries();

  switch (input.operation) {
    case "set": {
      const bytes = Buffer.byteLength(input.value, "utf8");
      if (bytes > maxV) {
        return {
          ok: false,
          error: `value size ${bytes} exceeds CLAWQL_CACHE_MAX_VALUE_BYTES (${maxV})`,
        } satisfies CacheSetResult;
      }
      const isNew = !mem.has(input.key);
      let evicted = 0;
      if (isNew) {
        evicted = evictLruUntilRoomForNewKey(mem, maxEntries);
      }
      mem.delete(input.key);
      mem.set(input.key, input.value);
      return {
        ok: true,
        operation: "set",
        key: input.key,
        ...(evicted > 0 ? { evicted } : {}),
      } satisfies CacheSetResult;
    }
    case "get": {
      const v = mem.get(input.key);
      if (v === undefined) {
        return { ok: true, hit: false, key: input.key } satisfies CacheGetResult;
      }
      touchLru(mem, input.key);
      return { ok: true, hit: true, key: input.key, value: v } satisfies CacheGetResult;
    }
    case "delete": {
      const existed = mem.has(input.key);
      mem.delete(input.key);
      return {
        ok: true,
        operation: "delete",
        key: input.key,
        deleted: existed,
      } satisfies CacheDeleteResult;
    }
    case "list": {
      const prefix = input.prefix ?? "";
      const listLimit = input.limit ?? 100;
      const keys = [...mem.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, listLimit);
      return {
        ok: true,
        operation: "list",
        prefix: prefix === "" ? undefined : prefix,
        count: keys.length,
        keys,
      } satisfies CacheListResult;
    }
    case "search": {
      const q = input.query.toLowerCase();
      const searchLimit = input.limit ?? 50;
      const keys = [...mem.keys()]
        .filter((k) => k.toLowerCase().includes(q))
        .sort()
        .slice(0, searchLimit);
      return {
        ok: true,
        operation: "search",
        query: input.query,
        count: keys.length,
        keys,
      } satisfies CacheSearchResult;
    }
  }
}

export function createLruCacheStore(
  getMaxValueBytes: () => number = getClawqlCacheMaxValueBytes,
  getMaxEntries: () => number = getClawqlCacheMaxEntries
): LruCacheStore {
  const mem = new Map<string, string>();
  return {
    getMaxValueBytes,
    getMaxEntries,
    execute: (input) => executeOnStore(mem, getMaxValueBytes, getMaxEntries, input),
    reset: () => mem.clear(),
  };
}

let defaultStore: LruCacheStore | undefined;

/** Shared in-process LRU store for `clawql-mcp` until full Layer bootstrap at API startup. */
export function getDefaultLruCacheStore(): LruCacheStore {
  if (!defaultStore) {
    defaultStore = createLruCacheStore();
  }
  return defaultStore;
}

/** Test helper — drops singleton so the next call creates a fresh store. */
export function resetDefaultLruCacheStoreForTests(): void {
  defaultStore?.reset();
  defaultStore = undefined;
}
