/**
 * Extension points for hybrid memory persistence (SQLite default, Postgres optional).
 *
 * Implementations live in `src/memory-db.ts`, `src/vector-store/pgvector.ts`, and future
 * modules. See docs/hybrid-memory-backends.md.
 */

/** Where chunk embeddings are indexed for `memory_recall` (see CLAWQL_VECTOR_BACKEND). */
export type VectorIndexBackendKind = "sqlite-blob" | "pgvector";

/**
 * Conceptual hook for vector retrieval — satisfied today by:
 * - sqlite: `vault_chunk.embedding` + JS cosine
 * - postgres: `clawql_memory_chunk_vector` + `<=>`
 */
export interface VectorIndexBackend {
  readonly kind: VectorIndexBackendKind;
}

/**
 * Future: fast approximate membership / dedup (issue #25).
 * Likely keyed by stable chunk or document ids from `memory.db` contract.
 */
export interface MembershipFilterBackend {
  readonly backend: "sqlite" | "postgres";
}

/**
 * Future: integrity proofs / Merkle metadata (issue #37).
 * May store roots and proofs beside or instead of full-tree materialization in SQLite.
 */
export interface IntegrityArtifactBackend {
  readonly backend: "sqlite" | "postgres";
}
