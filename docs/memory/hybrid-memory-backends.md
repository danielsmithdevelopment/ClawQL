# Hybrid memory: SQLite (default) and Postgres (optional)

ClawQL treats **vault Markdown** as the **source of truth**. Derived state can live in:

1. **`memory.db` (SQLite via sql.js)** — **default**, colocated with the vault (same folder or `CLAWQL_MEMORY_DB_PATH`). No extra service, ideal for laptops and single-node agents.
2. **Postgres** — **optional**, for operators who want HA, concurrent writers, pgvector indexes, backups, and room for **Cuckoo filters** and **Merkle-style integrity** artifacts without stuffing everything into one SQLite file.

**No SQLite unless you opt in:** if **`CLAWQL_OBSIDIAN_VAULT_PATH`** is unset or **`CLAWQL_MEMORY_DB=0`**, ClawQL does **not** create or use **`memory.db`** — same as before vectors existed.

**When hybrid memory is on** (vault configured and **`memory.db` enabled): the relational index (documents, chunks, wikilinks) lives in **`memory.db`\*\* — that is the default local index beside your Markdown.

**Vector storage choice (postgres backend only):** by default, embeddings are **dual-written** to **`vault_chunk.embedding`** and to Postgres (**parity + offline fallback**). Set **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`** to store vectors **only in Postgres** (smaller `memory.db`; no BLOB fallback for the vector leg). **`sqlite`** backend always keeps vectors in **`memory.db`** only.

---

## Choosing vector options (tradeoffs)

| You want…                                 | Set                                                                                 | Tradeoffs                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No semantic vectors**                   | `CLAWQL_VECTOR_BACKEND=off`                                                         | Lightest: keyword + wikilinks only. No embedding calls or vector storage.                                                                                                                                      |
| **Vectors beside the vault (default)**    | unset / `CLAWQL_VECTOR_BACKEND=sqlite`                                              | **Default.** In-process **local** MiniLM embeddings (no API key, no Ollama). First ingest downloads ~20MB ONNX weights into cache. Optional HTTP embeddings when `CLAWQL_EMBEDDING_API_KEY` is set.             |
| **Postgres + pgvector**                   | `CLAWQL_VECTOR_BACKEND=postgres` + **`CLAWQL_VECTOR_DATABASE_URL`**                 | **Pros:** **`pgvector`** queries (`<=>`), HA/backup. Embeddings: local MiniLM by default, or HTTP when an API key is set.                                                                                      |
| **“Postgres mode” but no URL yet**        | `CLAWQL_VECTOR_BACKEND=postgres` without **`CLAWQL_VECTOR_DATABASE_URL`**           | **Automatic fallback:** runtime uses **`memory.db`** vectors only (same as **`sqlite`**). A **one-time warning** is logged; set **`CLAWQL_VECTOR_BACKEND=sqlite`** explicitly if that is intentional.          |

**Dual-write (when effective backend is Postgres and URL is set):** default **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE`** is on — vectors exist in **both** Postgres and **`vault_chunk.embedding`**. **Pros:** Portable copy in the vault folder; **`memory_recall`** tries pgvector first, then **falls back** to SQLite BLOB ranking if the PG query fails or returns nothing. **Cons:** Duplicate storage for embeddings. Set **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`** to keep vectors **only in Postgres** (smaller `memory.db`; rely on PG availability for the vector leg).

**Recall path:** **`memory_recall`** uses **effective** backend selection (`effectiveVectorBackend()` in code): Postgres KNN when URL present; otherwise SQLite-style ranking over **`memory.db`** BLOBs.

---

## Defaults (best practice)

| Concern                                                                               | Default                                                                                                            | Optional upgrade                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Canonical notes                                                                       | Vault `.md`                                                                                                        | —                                                                                                        |
| Structured index (documents, chunks, wikilinks)                                       | **`memory.db`** (sql.js)                                                                                           | Same; Postgres is not a drop-in replacement for this file today                                          |
| Chunk vectors                                                                         | **`sqlite`** (default) — local MiniLM ONNX + KNN over `memory.db` BLOBs             | **`postgres`** + URL — pgvector KNN; dual-write BLOBs by default; **`off`** — keyword+wikilink only |
| Cuckoo membership ([#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)) | **`CLAWQL_CUCKOO_ENABLED=1`** — blob in **`memory.db`**; optional **`clawql_cuckoo_chunk_membership`** in Postgres | Same mirror when **`CLAWQL_VECTOR_DATABASE_URL`** is set                                                 |
| Merkle root ([#37](https://github.com/danielsmithdevelopment/ClawQL/issues/37))       | **`CLAWQL_MERKLE_ENABLED=1`** — **`vault_merkle_snapshot` / `clawql_vault_merkle`**                                | Proofs: **`merkleProof`** / **`verifyMerkleProof`** in **`src/merkle-tree.ts`**                          |

**Why SQLite stays default for vectors-on-disk:** it ships beside **`Memory/`** with zero ops. **Why Postgres exists:** pgvector ANN, connection pooling, and shared infrastructure for teams that already run Postgres.

---

## Postgres schema conventions

- **Prefix:** all ClawQL tables use **`clawql_`**.
- **Migrations:** **`clawql_pg_schema_migrations`** (versioned DDL, same idea as `schema_migrations` in `memory.db`). Canonical: **`packages/clawql-memory/`** (`memory-backends/postgres-migrations.ts`, `vector/pgvector.ts`); shims: **`src/memory-backends/postgres-migrations.ts`**, **`src/vector-store/pgvector.ts`**.
- **Extension:** **`CREATE EXTENSION IF NOT EXISTS vector`** (migration 1).
- **Artifact tables:** **`clawql_cuckoo_chunk_membership`**, **`clawql_vault_merkle`** (migration **2**) — mirrors the SQLite single-row snapshots when hybrid-memory sync runs against Postgres.

Changing **`CLAWQL_EMBEDDING_DIMENSION`** after **`clawql_memory_chunk_vector`** exists may require a manual **`ALTER`** or rebuild; the dimension is fixed at first migration for `vector(dim)`.

---

## Operational notes

- **Connection pool:** a single **`pg.Pool`** for **`CLAWQL_VECTOR_DATABASE_URL`** (see `getPostgresVectorPool`). HTTP and stdio entrypoints register **graceful pool shutdown** on **`SIGINT`/`SIGTERM`**.
- **CRUD:** today, “CRUD” for indexed vault content is **sync batches** from Markdown → `memory.db` (+ Postgres vectors when configured). A future phase may expose more granular APIs; both backends should keep **idempotent upserts** keyed by stable **`chunk_id`** / paths.
- **Testing:** CI does not require Postgres; vector PG code paths are mock-friendly. Local dev: Docker Postgres + `CREATE EXTENSION vector`.

---

## See also

- [`memory-db-schema.md`](memory-db-schema.md) — SQLite layout
- [`memory-db-hybrid-implementation.md`](memory-db-hybrid-implementation.md) — module map
- [`vector-search-design.md`](vector-search-design.md) — product direction
- Issues **[#24](https://github.com/danielsmithdevelopment/ClawQL/issues/24)**, **[#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)**, **[#37](https://github.com/danielsmithdevelopment/ClawQL/issues/37)**
