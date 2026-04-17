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
 * Approximate membership over stable `chunk_id` keys — implemented as a serialized Cuckoo filter
 * in `memory.db` (`clawql_cuckoo_chunk_membership`) and mirrored to Postgres when configured (#25).
 */
export interface MembershipFilterBackend {
  readonly backend: "sqlite" | "postgres";
}

/**
 * Merkle root over vault documents (sorted path + `body_sha256`) — `vault_merkle_snapshot` in SQLite
 * and `clawql_vault_merkle` in Postgres (#37). Proofs via `merkleProof` / `verifyMerkleProof` in `merkle-tree.ts`.
 */
export interface IntegrityArtifactBackend {
  readonly backend: "sqlite" | "postgres";
}
