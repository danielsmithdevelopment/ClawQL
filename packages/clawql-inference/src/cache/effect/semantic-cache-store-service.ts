import { Context, Effect, Layer } from "effect";
import type { SemanticCacheEntry, SemanticCacheLookupResult, SemanticCacheStore } from "../types.js";

/** Effect wrapper for semantic cache store lookup/put. */
export class SemanticCacheStoreService extends Context.Tag("clawql/SemanticCacheStoreService")<
  SemanticCacheStoreService,
  {
    readonly lookup: (input: {
      modelId: string;
      embedding: Float32Array;
      threshold: number;
      now?: number;
    }) => Effect.Effect<SemanticCacheLookupResult | null>;
    readonly put: (entry: SemanticCacheEntry) => Effect.Effect<void>;
  }
>() {}

export function semanticCacheStoreLiveLayer(
  store: SemanticCacheStore
): Layer.Layer<SemanticCacheStoreService> {
  return Layer.succeed(
    SemanticCacheStoreService,
    SemanticCacheStoreService.of({
      lookup: (input) => Effect.sync(() => store.lookup(input)),
      put: (entry) => Effect.sync(() => store.put(entry)),
    })
  );
}
