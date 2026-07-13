import type { PoolClient } from "pg";
import { inferenceEmbeddingDimension } from "../cache/vector.js";

export const INFERENCE_PG_SCHEMA_VERSION = 2;

async function currentSchemaVersion(client: PoolClient): Promise<number> {
  const result = await client.query<{ version: number | null }>(
    `SELECT MAX(version) AS version FROM clawql_inference_schema_migrations`
  );
  return result.rows[0]?.version ?? 0;
}

export async function runInferencePostgresMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_inference_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  let version = await currentSchemaVersion(client);

  if (version < 1) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS clawql_inference_calls (
        id text PRIMARY KEY,
        correlation_id text,
        record jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clawql_inference_calls_correlation_idx
      ON clawql_inference_calls (correlation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clawql_inference_calls_created_idx
      ON clawql_inference_calls (created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clawql_inference_calls_model_idx
      ON clawql_inference_calls ((record->>'modelId'))
    `);
    await client.query(
      `INSERT INTO clawql_inference_schema_migrations (version, name) VALUES (1, 'inference_calls_v1')
       ON CONFLICT (version) DO NOTHING`
    );
    version = 1;
  }

  if (version < 2) {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const dim = inferenceEmbeddingDimension();
    await client.query(`
      CREATE TABLE IF NOT EXISTS clawql_inference_semantic_cache (
        id text PRIMARY KEY,
        model_id text NOT NULL,
        signature_text text NOT NULL,
        system_prompt_hash text,
        embedding vector(${dim}) NOT NULL,
        embedding_dim integer NOT NULL,
        response jsonb NOT NULL,
        resource_tags text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clawql_inference_semantic_cache_model_exp_idx
      ON clawql_inference_semantic_cache (model_id, expires_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clawql_inference_semantic_cache_embedding_idx
      ON clawql_inference_semantic_cache
      USING hnsw (embedding vector_cosine_ops)
    `);
    await client.query(
      `INSERT INTO clawql_inference_schema_migrations (version, name) VALUES (2, 'semantic_cache_pgvector_v1')
       ON CONFLICT (version) DO NOTHING`
    );
  }
}
