import type pg from "pg";
import { ensureInferenceSchema, getInferencePgPool } from "../store/postgres-pool.js";
import type {
  SemanticCacheConfig,
  SemanticCacheEntry,
  SemanticCacheLookupResult,
  SemanticCacheStats,
  SemanticCacheStore,
} from "./types.js";
import { parseVectorText, toVectorLiteral } from "./vector.js";

/** Distributed semantic cache backed by Postgres pgvector (Layer 5). */
export class PostgresSemanticCacheStore implements SemanticCacheStore {
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: SemanticCacheConfig,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  private async ready(): Promise<void> {
    await ensureInferenceSchema(this.env);
  }

  async lookup(input: {
    modelId: string;
    embedding: Float32Array;
    threshold: number;
    now?: number;
  }): Promise<SemanticCacheLookupResult | null> {
    await this.ready();
    const now = input.now ?? Date.now();
    await this.prune(now);
    if (input.embedding.length === 0) {
      this.misses += 1;
      return null;
    }

    const qLit = toVectorLiteral(input.embedding);
    const result = await this.pool.query<{
      id: string;
      model_id: string;
      signature_text: string;
      system_prompt_hash: string | null;
      emb: string;
      response: unknown;
      resource_tags: string[] | null;
      created_at: Date;
      expires_at: Date;
      similarity: string;
    }>(
      `SELECT id, model_id, signature_text, system_prompt_hash, embedding::text AS emb,
              response, resource_tags, created_at, expires_at,
              (1 - (embedding <=> $1::vector))::float8 AS similarity
       FROM clawql_inference_semantic_cache
       WHERE model_id = $2 AND expires_at > to_timestamp($3 / 1000.0)
       ORDER BY embedding <=> $1::vector
       LIMIT 8`,
      [qLit, input.modelId, now]
    );

    let best: SemanticCacheLookupResult | null = null;
    for (const row of result.rows) {
      const similarity = Number(row.similarity);
      if (!Number.isFinite(similarity) || similarity < input.threshold) continue;
      const entry: SemanticCacheEntry = {
        id: row.id,
        modelId: row.model_id,
        signatureText: row.signature_text,
        systemPromptHash: row.system_prompt_hash ?? undefined,
        embedding: parseVectorText(row.emb),
        response: row.response as SemanticCacheEntry["response"],
        createdAt: row.created_at.getTime(),
        expiresAt: row.expires_at.getTime(),
        resourceTags: row.resource_tags ?? undefined,
      };
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
    await this.ready();
    const literal = toVectorLiteral(entry.embedding);
    await this.pool.query(
      `INSERT INTO clawql_inference_semantic_cache (
        id, model_id, signature_text, system_prompt_hash, embedding, embedding_dim,
        response, resource_tags, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7::jsonb, $8, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      ON CONFLICT (id) DO UPDATE SET
        response = EXCLUDED.response,
        expires_at = EXCLUDED.expires_at,
        resource_tags = EXCLUDED.resource_tags`,
      [
        entry.id,
        entry.modelId,
        entry.signatureText,
        entry.systemPromptHash ?? null,
        literal,
        entry.embedding.length,
        JSON.stringify(entry.response),
        entry.resourceTags ?? [],
        entry.createdAt,
        entry.expiresAt,
      ]
    );

    const overflow = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM clawql_inference_semantic_cache WHERE model_id = $1`,
      [entry.modelId]
    );
    const count = Number.parseInt(overflow.rows[0]?.count ?? "0", 10);
    if (count > this.config.maxEntries) {
      await this.pool.query(
        `DELETE FROM clawql_inference_semantic_cache
         WHERE id IN (
           SELECT id FROM clawql_inference_semantic_cache
           WHERE model_id = $1
           ORDER BY created_at ASC
           LIMIT $2
         )`,
        [entry.modelId, count - this.config.maxEntries]
      );
    }
  }

  async invalidateByTags(tags: string[], now: number = Date.now()): Promise<number> {
    if (!tags.length) return 0;
    await this.ready();
    await this.prune(now);
    const result = await this.pool.query(
      `DELETE FROM clawql_inference_semantic_cache
       WHERE resource_tags && $1::text[]`,
      [tags]
    );
    return result.rowCount ?? 0;
  }

  stats(): SemanticCacheStats {
    return {
      entries: 0,
      hits: this.hits,
      misses: this.misses,
      enabled: this.config.enabled,
      threshold: this.config.threshold,
      ttlMs: this.config.ttlMs,
    };
  }

  async prune(now: number = Date.now()): Promise<number> {
    await this.ready();
    const result = await this.pool.query(
      `DELETE FROM clawql_inference_semantic_cache WHERE expires_at <= to_timestamp($1 / 1000.0)`,
      [now]
    );
    return result.rowCount ?? 0;
  }
}

export type SemanticCacheBackend = "memory" | "postgres";

export function resolveSemanticCacheBackend(
  env: NodeJS.ProcessEnv = process.env
): SemanticCacheBackend {
  const raw = env.CLAWQL_INFERENCE_SEMANTIC_CACHE_BACKEND?.trim().toLowerCase();
  if (raw === "memory" || raw === "inmemory" || raw === "in-memory") return "memory";
  if (raw === "postgres" || raw === "pg" || raw === "pgvector") return "postgres";
  if (getInferencePgPool(env)) return "postgres";
  return "memory";
}

export async function createSemanticCacheStore(
  config: SemanticCacheConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<SemanticCacheStore> {
  const backend = resolveSemanticCacheBackend(env);
  if (backend === "postgres") {
    const pool = getInferencePgPool(env);
    if (!pool) {
      console.warn(
        "[clawql-inference] CLAWQL_INFERENCE_SEMANTIC_CACHE_BACKEND=postgres but no inference DB configured; using in-memory cache"
      );
    } else {
      return new PostgresSemanticCacheStore(pool, config, env);
    }
  }

  const { InMemorySemanticCacheStore } = await import("./in-memory.js");
  return new InMemorySemanticCacheStore({
    enabled: config.enabled,
    threshold: config.threshold,
    ttlMs: config.ttlMs,
    maxEntries: config.maxEntries,
  });
}
