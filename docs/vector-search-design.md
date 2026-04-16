# Vector search & embeddings — backend design (draft)

This note captures a **direction** for **[#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16)** (optional semantic retrieval for `memory_recall` and spec `search`). It is **not** a committed roadmap until implementation lands.

## Goals

- **Pluggable embeddings** — local small model and/or remote API; off by default so core installs stay lean.
- **Two vector stores** — **SQLite** (file-backed, minimal ops) and **Postgres + pgvector** (shared DB, concurrent writers, backups).
- **Shared indexing rules** — chunking, metadata, and reindex triggers live in one place; only the **storage backend** differs.
- **Gradual rollout** — keep lexical + wikilink behavior; add vectors as an **optional** path when configured.

## Non-goals (initially)

- Replacing keyword search entirely.
- Requiring GPU or a large model for default installs.

## Architecture

### 1. Embedding provider (orthogonal to DB)

A small internal interface (names illustrative):

- `embed(text: string): Promise<number[]>` (or batch variant).
- Implementations: HTTP OpenAI-compatible, local `transformers`/ONNX, etc.
- Selected via env (e.g. `CLAWQL_EMBEDDING_PROVIDER`, model IDs, API keys). **Unset ⇒ vector features off.**

### 2. Canonical chunk record

Something stable both backends must persist:

| Field | Purpose |
|-------|---------|
| `id` | Stable UUID or hash-derived id |
| `source_kind` | e.g. `vault`, `spec_operation` |
| `source_id` | Vault-relative path, or `operationId` / composite key |
| `text` | Chunk plain text used for embedding |
| `embedding` | Float vector (fixed dimension per model) |
| `metadata` | JSON: headings, mtime, provider label, etc. |

### 3. Vector store interface (backend-agnostic)

Operations the rest of ClawQL would call:

- `upsert(chunks)` — insert or replace by `id` / dedupe key.
- `deleteBySource(source_kind, source_id)` — reindex / vault file delete.
- `query(vector, { limit, filter })` — kNN + optional metadata filters (path prefix, provider, etc.).

Implementations:

- **`VectorStoreSqlite`** — single SQLite file (path from env).
- **`VectorStorePostgres`** — Postgres with **`pgvector`** (schema + migrations).

Selection:

- **`CLAWQL_VECTOR_BACKEND=off|sqlite|postgres`** (default `off`).
- **SQLite:** e.g. `CLAWQL_VECTOR_SQLITE_PATH` (absolute path to a file; created as needed).
- **Postgres:** e.g. `CLAWQL_VECTOR_DATABASE_URL` (connection string; app enables `pgvector` extension in migration or documents manual `CREATE EXTENSION`).

### 4. SQLite vs Postgres — when to use which

| Profile | Store | Typical use |
|--------|--------|-------------|
| **Lean / local** | SQLite | `npx`, laptop, single user; no extra container. |
| **Compose / K8s / prod** | Postgres | Multiple replicas, HA, familiar ops, easier hybrid SQL later. |

Same embedding provider and chunking code; only **connection + SQL** differ.

### 5. Integration points (future)

- **`memory_recall`:** hybrid lexical + vector + wikilink graph (weights TBD).
- **`search`:** optional vector re-rank or parallel index over operation descriptions when an index exists; fallback to current keyword ranker in `spec-search`.

## Phasing (suggested)

1. **Interface + SQLite (file-backed)** — **`CLAWQL_VECTOR_BACKEND=sqlite`**: float32 BLOBs on `vault_chunk` + OpenAI-compatible **`/embeddings`** (sql.js / in-process KNN; no sqlite-vec loadable extension in the WASM build).
2. **Postgres + pgvector** — **`CLAWQL_VECTOR_BACKEND=postgres`** + **`CLAWQL_VECTOR_DATABASE_URL`**: table **`clawql_memory_chunk_vector`**, cosine via **`<=>`**, auto-**`CREATE EXTENSION vector`** on first connect (implemented; **`pg`** dependency).
3. **Hybrid & tuning** — `memory_recall` fuses lexical + vector + wikilinks; optional IVFFLAT / HNSW indexes in Postgres are operator-managed, not created by ClawQL yet.

## Open decisions

- Exact SQLite stack (**sqlite-vec**, **sqlite-vss**, or store vectors as BLOB + custom index) — pick at implementation time based on maintenance and Node bindings.
- Whether to support **migrating** an index from SQLite → Postgres (export/re-embed vs copy vectors).
- Dimension / model versioning when embeddings change (namespace tables or `embedding_model` column).

## Related docs

- [`hybrid-memory-backends.md`](hybrid-memory-backends.md) — **SQLite (default) vs Postgres (optional)** for vectors and future hybrid artifacts.
- [`memory-obsidian.md`](memory-obsidian.md) — vault semantics for ingest/recall today.
- [`memory-db-schema.md`](memory-db-schema.md) — **`memory.db`** layout (chunks + wikilinks today; vector columns reserved).
- [`mcp-tools.md`](mcp-tools.md) — current MCP tools (no vector fields until shipped).
