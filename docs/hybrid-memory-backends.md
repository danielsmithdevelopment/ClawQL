# Hybrid memory: SQLite (default) and Postgres (optional)

ClawQL treats **vault Markdown** as the **source of truth**. Derived state can live in:

1. **`memory.db` (SQLite via sql.js)** — **default**, colocated with the vault (same folder or `CLAWQL_MEMORY_DB_PATH`). No extra service, ideal for laptops and single-node agents.
2. **Postgres** — **optional**, for operators who want HA, concurrent writers, pgvector indexes, backups, and room for **Cuckoo filters** and **Merkle-style integrity** artifacts without stuffing everything into one SQLite file.

You can use **one or both**: today, **relational document/chunk/wikilink rows** are always written to **`memory.db`** when enabled; **vectors** go either into **`vault_chunk.embedding`** (sqlite backend) or into **Postgres** (postgres backend), never duplicated in both for the same deployment mode.

---

## Defaults (best practice)

| Concern | Default | Optional upgrade |
|--------|---------|------------------|
| Canonical notes | Vault `.md` | — |
| Structured index (documents, chunks, wikilinks) | **`memory.db`** (sql.js) | Same; Postgres is not a drop-in replacement for this file today |
| Chunk vectors | **`CLAWQL_VECTOR_BACKEND=sqlite`** (BLOB + in-process KNN) | **`CLAWQL_VECTOR_BACKEND=postgres`** + **`CLAWQL_VECTOR_DATABASE_URL`** |
| Future: Cuckoo membership (#25) | TBD (likely SQLite blobs or Postgres BYTEA) | Same table layout in PG for scale-out |
| Future: Merkle / integrity (#37) | TBD | Postgres-friendly for multi-replica |

**Why SQLite stays default for vectors-on-disk:** it ships beside **`Memory/`** with zero ops. **Why Postgres exists:** pgvector ANN, connection pooling, and shared infrastructure for teams that already run Postgres.

---

## Postgres schema conventions

- **Prefix:** all ClawQL tables use **`clawql_`**.
- **Migrations:** **`clawql_pg_schema_migrations`** (versioned DDL, same idea as `schema_migrations` in `memory.db`). See **`src/memory-backends/postgres-migrations.ts`** (invoked from **`src/vector-store/pgvector.ts`**).
- **Extension:** **`CREATE EXTENSION IF NOT EXISTS vector`** (migration 1).
- **Future tables:** e.g. **`clawql_cuckoo_filter`**, **`clawql_vault_merkle`** — add new migration versions; do not ad-hoc `CREATE TABLE` outside the migration runner.

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
