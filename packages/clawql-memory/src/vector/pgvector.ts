/**
 * Postgres + pgvector storage for vault chunk embeddings (CLAWQL_VECTOR_BACKEND=postgres).
 * Complements sql.js memory.db (documents / wikilinks); vectors live in a separate database.
 *
 * Domain APIs are Effect-primary; thin Promise façades remain for erase/recall edges.
 */

import pg from "pg";
import { Effect } from "effect";
import { runPostgresHybridMemoryMigrationsEffect } from "../db/postgres-migrations.js";
import { aggregateScoresToDocumentBest, type VectorRankedRow } from "../embedding/embedding.js";
import { MemoryError } from "../effect/memory-errors.js";
import { memoryFromPromise } from "../effect/memory-effect-utils.js";

let pool: pg.Pool | null = null;
let shutdownHooksRegistered = false;

export function getPostgresVectorPool(): pg.Pool | null {
  const url = process.env.CLAWQL_VECTOR_DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 8 });
  }
  return pool;
}

/** Idempotent graceful shutdown for long-running MCP processes (HTTP or workers). */
export function closePostgresVectorPoolEffect(): Effect.Effect<void, MemoryError> {
  return memoryFromPromise(async () => {
    if (pool) {
      await pool.end();
      pool = null;
    }
  });
}

/** Promise façade. */
export async function closePostgresVectorPool(): Promise<void> {
  return Effect.runPromise(closePostgresVectorPoolEffect());
}

/** Register once — closes the pg pool on SIGINT/SIGTERM so serverless/containers drain cleanly. */
export function registerPostgresPoolShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const onSignal = (): void => {
    void closePostgresVectorPool().catch(() => {});
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

export { embeddingVectorDimension } from "../embedding/embedding.js";

function parseVectorText(s: string): Float32Array {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) {
    return new Float32Array(0);
  }
  const inner = t.slice(1, -1);
  if (inner.length === 0) return new Float32Array(0);
  const parts = inner.split(",");
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    out[i] = Number.parseFloat(parts[i]!.trim());
  }
  return out;
}

export function ensurePgVectorSchemaEffect(
  client: pg.PoolClient
): Effect.Effect<void, MemoryError> {
  return runPostgresHybridMemoryMigrationsEffect(client);
}

/** Promise façade. */
export async function ensurePgVectorSchema(client: pg.PoolClient): Promise<void> {
  return Effect.runPromise(ensurePgVectorSchemaEffect(client));
}

export function loadPostgresChunkVectorsByPathsEffect(
  paths: string[]
): Effect.Effect<Map<string, { model: string; vector: Float32Array }>, MemoryError> {
  return memoryFromPromise(async () => {
    const out = new Map<string, { model: string; vector: Float32Array }>();
    const p = getPostgresVectorPool();
    if (!p || paths.length === 0) return out;

    const client = await p.connect();
    try {
      await ensurePgVectorSchema(client);
      const res = await client.query<{
        chunk_id: string;
        embedding_model: string;
        emb: string;
      }>(
        `SELECT chunk_id, embedding_model, embedding::text AS emb
       FROM clawql_memory_chunk_vector
       WHERE document_path = ANY($1::text[])`,
        [paths]
      );
      for (const row of res.rows) {
        const vec = parseVectorText(row.emb);
        if (vec.length === 0) continue;
        out.set(row.chunk_id, { model: row.embedding_model, vector: vec });
      }
      return out;
    } finally {
      client.release();
    }
  });
}

/** Promise façade. */
export async function loadPostgresChunkVectorsByPaths(
  paths: string[]
): Promise<Map<string, { model: string; vector: Float32Array }>> {
  return Effect.runPromise(loadPostgresChunkVectorsByPathsEffect(paths));
}

export type PlannedChunkForPg = {
  id: string;
  text: string;
  floatVec: Float32Array | null;
  embeddingModel: string | null;
};

export function upsertPostgresChunkVectorsEffect(
  planned: Array<{ path: string; chunks: PlannedChunkForPg[] }>
): Effect.Effect<void, MemoryError> {
  return memoryFromPromise(async () => {
    const p = getPostgresVectorPool();
    if (!p) return;

    const paths = [...new Set(planned.map((x) => x.path))];
    const client = await p.connect();
    try {
      await ensurePgVectorSchema(client);
      await client.query("BEGIN");
      if (paths.length > 0) {
        await client.query(
          `DELETE FROM clawql_memory_chunk_vector WHERE document_path = ANY($1::text[])`,
          [paths]
        );
      }
      for (const { path, chunks } of planned) {
        for (const c of chunks) {
          if (!c.floatVec || !c.embeddingModel) continue;
          const literal = `[${Array.from(c.floatVec).join(",")}]`;
          await client.query(
            `INSERT INTO clawql_memory_chunk_vector (
            chunk_id, document_path, text, embedding, embedding_model, embedding_dim, updated_at
          ) VALUES ($1, $2, $3, $4::vector, $5, $6, NOW())`,
            [c.id, path, c.text, literal, c.embeddingModel, c.floatVec.length]
          );
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}

/** Promise façade. */
export async function upsertPostgresChunkVectors(
  planned: Array<{ path: string; chunks: PlannedChunkForPg[] }>
): Promise<void> {
  return Effect.runPromise(upsertPostgresChunkVectorsEffect(planned));
}

/** Erase pgvector rows for document paths (no-op when postgres backend unset). */
export function deletePostgresChunkVectorsByPathsEffect(
  paths: string[]
): Effect.Effect<void, MemoryError> {
  return memoryFromPromise(async () => {
    const p = getPostgresVectorPool();
    if (!p || paths.length === 0) return;
    const client = await p.connect();
    try {
      await ensurePgVectorSchema(client);
      await client.query(
        `DELETE FROM clawql_memory_chunk_vector WHERE document_path = ANY($1::text[])`,
        [paths]
      );
    } finally {
      client.release();
    }
  });
}

/** Promise façade. */
export async function deletePostgresChunkVectorsByPaths(paths: string[]): Promise<void> {
  return Effect.runPromise(deletePostgresChunkVectorsByPathsEffect(paths));
}

function toVectorLiteral(v: Float32Array): string {
  return `[${Array.from(v).join(",")}]`;
}

/**
 * Cosine distance `<=>` + per-document best score, aligned with sqlite JS ranking.
 */
export function queryPostgresVectorKnnEffect(
  queryVec: Float32Array,
  documentPaths: string[],
  opts: { topChunks: number; maxDocs: number }
): Effect.Effect<{ path: string; score: number; chunkId: string }[], MemoryError> {
  return memoryFromPromise(async () => {
    const p = getPostgresVectorPool();
    if (!p || documentPaths.length === 0 || queryVec.length === 0) return [];

    const client = await p.connect();
    try {
      await ensurePgVectorSchema(client);
      const qLit = toVectorLiteral(queryVec);
      const lim = Math.max(1, opts.topChunks);
      const res = await client.query<{
        chunk_id: string;
        document_path: string;
        score: string;
      }>(
        `SELECT chunk_id, document_path,
              (1 - (embedding <=> $1::vector))::float8 AS score
       FROM clawql_memory_chunk_vector
       WHERE document_path = ANY($2::text[])
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
        [qLit, documentPaths, lim]
      );
      const rows: VectorRankedRow[] = res.rows.map((r) => ({
        documentPath: r.document_path,
        chunkId: r.chunk_id,
        score: Number(r.score),
      }));
      return aggregateScoresToDocumentBest(rows, opts.maxDocs);
    } finally {
      client.release();
    }
  });
}

/** Promise façade. */
export async function queryPostgresVectorKnn(
  queryVec: Float32Array,
  documentPaths: string[],
  opts: { topChunks: number; maxDocs: number }
): Promise<{ path: string; score: number; chunkId: string }[]> {
  return Effect.runPromise(queryPostgresVectorKnnEffect(queryVec, documentPaths, opts));
}
