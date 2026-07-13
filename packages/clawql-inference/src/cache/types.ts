import type { InferenceResponse } from "../gateway.js";
import { parseSinceDuration } from "../observability/parse-since.js";
import { resolveInferenceEmbeddingConfig } from "./embedding.js";

export type SemanticCacheConfig = {
  enabled: boolean;
  threshold: number;
  ttlMs: number;
  maxEntries: number;
};

const DEFAULT_THRESHOLD = 0.92;
const DEFAULT_TTL_MS = 86_400_000;
const DEFAULT_MAX_ENTRIES = 1000;

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseTtlMs(env: NodeJS.ProcessEnv): number {
  const duration = env.CLAWQL_INFERENCE_CACHE_TTL?.trim();
  if (duration) {
    const since = parseSinceDuration(duration);
    if (since) return Date.now() - since.getTime();
  }
  const rawMs = env.CLAWQL_INFERENCE_CACHE_TTL_MS?.trim();
  if (rawMs) {
    const ms = Number.parseInt(rawMs, 10);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return DEFAULT_TTL_MS;
}

export function loadSemanticCacheConfig(env: NodeJS.ProcessEnv = process.env): SemanticCacheConfig {
  const thresholdRaw = env.CLAWQL_INFERENCE_CACHE_THRESHOLD?.trim();
  const threshold = thresholdRaw ? Number.parseFloat(thresholdRaw) : DEFAULT_THRESHOLD;
  const maxRaw = env.CLAWQL_INFERENCE_CACHE_MAX_ENTRIES?.trim();
  const maxEntries = maxRaw ? Number.parseInt(maxRaw, 10) : DEFAULT_MAX_ENTRIES;
  const explicit = env.CLAWQL_INFERENCE_SEMANTIC_CACHE?.trim();
  const enabled =
    explicit === undefined ? resolveInferenceEmbeddingConfig(env) !== null : parseTruthy(explicit);
  return {
    enabled,
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    ttlMs: parseTtlMs(env),
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES,
  };
}

export function semanticCacheActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = loadSemanticCacheConfig(env);
  return config.enabled && resolveInferenceEmbeddingConfig(env) !== null;
}

export type SemanticCacheEntry = {
  id: string;
  modelId: string;
  signatureText: string;
  systemPromptHash?: string;
  embedding: Float32Array;
  response: InferenceResponse;
  createdAt: number;
  expiresAt: number;
  /** Layer 5 — coarse resource tags for write invalidation. */
  resourceTags?: string[];
};

export type SemanticCacheLookupResult = {
  entry: SemanticCacheEntry;
  similarity: number;
};

export type SemanticCacheStats = {
  entries: number;
  hits: number;
  misses: number;
  enabled: boolean;
  threshold: number;
  ttlMs: number;
};

export interface SemanticCacheStore {
  lookup(input: {
    modelId: string;
    embedding: Float32Array;
    threshold: number;
    now?: number;
  }): Promise<SemanticCacheLookupResult | null>;
  put(entry: SemanticCacheEntry): Promise<void>;
  invalidateByTags(tags: string[], now?: number): Promise<number>;
  stats(): SemanticCacheStats;
  prune(now?: number): Promise<number>;
}
