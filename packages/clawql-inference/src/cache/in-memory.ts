import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "./embedding.js";
import type {
  SemanticCacheEntry,
  SemanticCacheLookupResult,
  SemanticCacheStats,
  SemanticCacheStore,
} from "./types.js";

export class InMemorySemanticCacheStore implements SemanticCacheStore {
  private readonly entries: SemanticCacheEntry[] = [];
  private hits = 0;
  private misses = 0;
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(
    options: {
      enabled?: boolean;
      threshold?: number;
      ttlMs?: number;
      maxEntries?: number;
    } = {}
  ) {
    this.enabled = options.enabled ?? true;
    this.threshold = options.threshold ?? 0.92;
    this.ttlMs = options.ttlMs ?? 86_400_000;
    this.maxEntries = options.maxEntries ?? 1000;
  }

  async lookup(input: {
    modelId: string;
    embedding: Float32Array;
    threshold: number;
    now?: number;
  }): Promise<SemanticCacheLookupResult | null> {
    const now = input.now ?? Date.now();
    this.prune(now);
    let best: SemanticCacheLookupResult | null = null;
    for (const entry of this.entries) {
      if (entry.modelId !== input.modelId) continue;
      if (entry.expiresAt <= now) continue;
      const similarity = cosineSimilarity(input.embedding, entry.embedding);
      if (similarity < input.threshold) continue;
      if (!best || similarity > best.similarity) {
        best = { entry, similarity };
      }
    }
    if (best) {
      this.hits += 1;
      return best;
    }
    this.misses += 1;
    return null;
  }

  async put(entry: SemanticCacheEntry): Promise<void> {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.sort((a, b) => a.createdAt - b.createdAt);
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  async invalidateByTags(tags: string[], now: number = Date.now()): Promise<number> {
    if (!tags.length) return 0;
    const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
    const before = this.entries.length;
    const kept = this.entries.filter((entry) => {
      if (!entry.resourceTags?.length) return true;
      return !entry.resourceTags.some((tag) => tagSet.has(tag.toLowerCase()));
    });
    this.entries.length = 0;
    this.entries.push(...kept);
    this.prune(now);
    return before - this.entries.length;
  }

  stats(): SemanticCacheStats {
    return {
      entries: this.entries.length,
      hits: this.hits,
      misses: this.misses,
      enabled: this.enabled,
      threshold: this.threshold,
      ttlMs: this.ttlMs,
    };
  }

  async prune(now: number = Date.now()): Promise<number> {
    const before = this.entries.length;
    const kept = this.entries.filter((e) => e.expiresAt > now);
    this.entries.length = 0;
    this.entries.push(...kept);
    return before - kept.length;
  }

  /** Test helper */
  snapshot(): SemanticCacheEntry[] {
    return [...this.entries];
  }
}

export function createSemanticCacheEntry(input: {
  modelId: string;
  signatureText: string;
  systemPromptHash?: string;
  embedding: Float32Array;
  response: import("../gateway.js").InferenceResponse;
  ttlMs: number;
  resourceTags?: string[];
  now?: number;
}): SemanticCacheEntry {
  const now = input.now ?? Date.now();
  return {
    id: randomUUID(),
    modelId: input.modelId,
    signatureText: input.signatureText,
    systemPromptHash: input.systemPromptHash,
    embedding: input.embedding,
    response: input.response,
    createdAt: now,
    expiresAt: now + input.ttlMs,
    resourceTags: input.resourceTags,
  };
}
