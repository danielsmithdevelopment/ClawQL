import { loadSemanticCacheConfig, semanticCacheActive } from "../cache/types.js";
import { resolveInferenceEmbeddingConfig } from "../cache/embedding.js";
import { Effect } from "effect";

export type InferenceCacheStatusOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceCacheStatusImpl(
  options: InferenceCacheStatusOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = loadSemanticCacheConfig(env);
  const embedding = resolveInferenceEmbeddingConfig(env);

  const payload = {
    active: semanticCacheActive(env),
    config,
    embeddingConfigured: embedding !== null,
    embeddingModel: embedding?.model,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(`semantic_cache: ${payload.active ? "on" : "off"}`);
  console.log(`threshold: ${config.threshold}`);
  console.log(`ttl_ms: ${config.ttlMs}`);
  console.log(`max_entries: ${config.maxEntries}`);
  console.log(`embedding: ${embedding ? embedding.model : "not configured (need OPENAI_API_KEY)"}`);
  return 0;
}

export function runInferenceCacheStatusEffect(
  options: InferenceCacheStatusOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceCacheStatusImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceCacheStatusEffect} for Effect callers. */
export async function runInferenceCacheStatus(
  options: InferenceCacheStatusOptions = {}
): Promise<number> {
  return Effect.runPromise(runInferenceCacheStatusEffect(options));
}
