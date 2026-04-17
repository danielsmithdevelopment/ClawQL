/**
 * Versioned DDL for ClawQL Postgres hybrid memory (pgvector + future Cuckoo / Merkle tables).
 * Mirrors the spirit of `schema_migrations` in sql.js `memory.db`.
 */

import type { PoolClient } from "pg";
import { embeddingVectorDimension } from "../memory-embedding.js";

/** Bump when adding a new migration step. */
export const PG_HYBRID_MEMORY_SCHEMA_VERSION = 2;

async function currentMigrationVersion(client: PoolClient): Promise<number> {
  const r = await client.query<{ m: string | null }>(
    "SELECT MAX(version)::text AS m FROM clawql_pg_schema_migrations"
  );
  const cell = r.rows[0]?.m;
  if (cell === null || cell === undefined) return 0;
  const n = Number.parseInt(cell, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Apply pending migrations inside an optional outer transaction.
 * Safe to call on every pool checkout path (idempotent DDL).
 */
export async function runPostgresHybridMemoryMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_pg_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let v = await currentMigrationVersion(client);
  if (v >= PG_HYBRID_MEMORY_SCHEMA_VERSION) return;

  if (v < 1) {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const dim = embeddingVectorDimension();
    await client.query(`
      CREATE TABLE IF NOT EXISTS clawql_memory_chunk_vector (
        chunk_id TEXT PRIMARY KEY,
        document_path TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding vector(${dim}),
        embedding_model TEXT NOT NULL,
        embedding_dim INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clawql_vec_doc ON clawql_memory_chunk_vector(document_path)
    `);
    await client.query(
      `INSERT INTO clawql_pg_schema_migrations (version, name) VALUES (1, 'chunk_vector_v1')
       ON CONFLICT (version) DO NOTHING`
    );
    v = 1;
  }

  if (v < 2) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS clawql_cuckoo_chunk_membership (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        filter_blob BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS clawql_vault_merkle (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        root_hex TEXT NOT NULL,
        leaf_count INTEGER NOT NULL,
        tree_height INTEGER NOT NULL,
        built_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `INSERT INTO clawql_pg_schema_migrations (version, name) VALUES (2, 'cuckoo_merkle_v1')
       ON CONFLICT (version) DO NOTHING`
    );
    v = 2;
  }

  if (v < PG_HYBRID_MEMORY_SCHEMA_VERSION) {
    throw new Error(
      `clawql Postgres migrations incomplete: at v${v}, expected ${PG_HYBRID_MEMORY_SCHEMA_VERSION}`
    );
  }
}
