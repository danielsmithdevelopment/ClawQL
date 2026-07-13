import { Context, Effect, Layer } from "effect";
import { getClawqlCacheMaxEntries, getClawqlCacheMaxValueBytes } from "./config.js";
import { createLruCacheStore, getDefaultLruCacheStore, type LruCacheStore } from "./lru-store.js";
import type { CacheOperationInput, CacheOperationResult } from "./types.js";

export class CacheService extends Context.Tag("clawql/CacheService")<
  CacheService,
  {
    readonly getMaxValueBytes: () => number;
    readonly getMaxEntries: () => number;
    readonly execute: (input: CacheOperationInput) => Effect.Effect<CacheOperationResult>;
    readonly resetForTests: () => Effect.Effect<void>;
  }
>() {}

function serviceFromStore(store: LruCacheStore) {
  return CacheService.of({
    getMaxValueBytes: store.getMaxValueBytes,
    getMaxEntries: store.getMaxEntries,
    execute: (input) => Effect.sync(() => store.execute(input)),
    resetForTests: () => Effect.sync(() => store.reset()),
  });
}

/** Isolated LRU store for tests; optional caps override env defaults. */
export function createCacheTestLayer(
  getMaxValueBytes: () => number = getClawqlCacheMaxValueBytes,
  getMaxEntries: () => number = getClawqlCacheMaxEntries
) {
  return Layer.effect(
    CacheService,
    Effect.sync(() => serviceFromStore(createLruCacheStore(getMaxValueBytes, getMaxEntries)))
  );
}

/** Default isolated store for unit tests (`Effect.provide(CacheTestLayer)`). */
export const CacheTestLayer = createCacheTestLayer(
  () => 1024 * 1024,
  () => 10_000
);

/** In-memory LRU store backed by the process-wide default store (MCP bridge). */
export const CacheLive = Layer.effect(
  CacheService,
  Effect.sync(() => serviceFromStore(getDefaultLruCacheStore()))
);

/** Run a single cache operation via Effect services. */
export function cacheOperationProgram(
  input: CacheOperationInput
): Effect.Effect<CacheOperationResult, never, CacheService> {
  return Effect.gen(function* () {
    const cache = yield* CacheService;
    return yield* cache.execute(input);
  });
}
