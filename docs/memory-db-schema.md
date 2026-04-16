# `memory.db` schema (hybrid memory, issue #27)

ClawQL stores a **file-backed SQLite** database beside the Obsidian vault (default **`memory.db`**) to back the hybrid memory track: **structured rows** (documents, paragraph chunks, wikilink edges), plus **optional float32 vectors** on **`vault_chunk`** when **`CLAWQL_VECTOR_BACKEND=sqlite`** or dual-write with **`postgres`** (see **[hybrid-memory-backends.md](hybrid-memory-backends.md)**).

**Implementation narrative (modules, flows, migrations, tests):** **[memory-db-hybrid-implementation.md](memory-db-hybrid-implementation.md)**.

The vault Markdown files remain the **source of truth**; the DB is a **derived index** rebuilt from vault content on **`memory_ingest`** (full scan of the recall subtree) and optionally on **`memory_recall`** when `CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`.

## Location

| Env                          | Meaning                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `CLAWQL_OBSIDIAN_VAULT_PATH` | Required for any memory DB work (same as `memory_*` tools).                                 |
| `CLAWQL_MEMORY_DB_PATH`      | Optional. **Unset:** `memory.db` under the vault. **Absolute path:** use that file instead. |
| `CLAWQL_MEMORY_DB=0`         | Disable all DB open / sync / merge (lexical recall only).                                   |

## Migrations

Table **`schema_migrations`** records applied DDL versions. The in-code constant **`SCHEMA_VERSION`** is **1** in `src/memory-db.ts` (bump when adding migrations).

## Tables

### `vault_document`

One row per indexed Markdown path (vault-relative, `/` separators).

| Column              | Type    | Description                                                                |
| ------------------- | ------- | -------------------------------------------------------------------------- |
| `path`              | TEXT PK | Vault-relative path, e.g. `Memory/foo.md`.                                 |
| `title`             | TEXT    | Display title from frontmatter / first `#` heading / filename slug.        |
| `body_sha256`       | TEXT    | SHA-256 of the **full file** UTF-8 bytes.                                  |
| `byte_length`       | INTEGER | `Buffer.byteLength` of the file.                                           |
| `mtime_ms`          | INTEGER | Writer-supplied timestamp (ingest/recall use `Date.now()` today).          |
| `index_body_sha256` | TEXT    | SHA-256 of the **indexable body** (Markdown after YAML frontmatter strip). |
| `chunk_strategy`    | TEXT    | Chunker id, e.g. `paragraph_v1`.                                           |
| `indexed_at`        | TEXT    | ISO-8601 UTC when the row was written.                                     |

### `vault_chunk`

Embeddable segments for semantic search (text always; **`embedding`** / **`embedding_model`** populated when the embedding pipeline is enabled).

| Column                   | Type      | Description                                                                                                                                      |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chunk_id`               | TEXT PK   | `sha256("vault\|{path}\|{strategy}\|{ordinal}\|{content_sha256}")` — stable across re-index.                                                     |
| `document_path`          | TEXT FK   | → `vault_document.path` (`ON DELETE CASCADE`).                                                                                                   |
| `ordinal`                | INTEGER   | Order within the document (0-based).                                                                                                             |
| `char_start`, `char_end` | INTEGER   | Offsets into the **indexable body** string (UTF-16 indices, matching JavaScript `String` slicing).                                               |
| `text`                   | TEXT      | Chunk plain text used for embeddings / lexical snippets.                                                                                         |
| `content_sha256`         | TEXT      | SHA-256 of `text`.                                                                                                                               |
| `chunk_strategy`         | TEXT      | Same as parent contract (`paragraph_v1`).                                                                                                        |
| `embedding_model`        | TEXT NULL | Set when embeddings are written into this row ( **`sqlite`** backend, or **`postgres`** with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE`** not **`0`**). |
| `embedding`              | BLOB NULL | Float32 vector payload. **`postgres`** + **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**: left **NULL** (vectors only in Postgres).                      |

### `wikilink_edge`

Directed edges mirroring Obsidian `[[wikilinks]]` in each source file.

| Column             | Type       | Description                                                                        |
| ------------------ | ---------- | ---------------------------------------------------------------------------------- |
| `id`               | INTEGER PK | Autoincrement.                                                                     |
| `from_path`        | TEXT       | Source Markdown path.                                                              |
| `to_target`        | TEXT       | Raw link target (left side of `\|`).                                               |
| `to_resolved_path` | TEXT NULL  | Vault-relative destination when the slug maps to a scanned file; otherwise `NULL`. |

Unique on `(from_path, to_target)` — re-ingest uses `INSERT OR REPLACE` semantics per edge row.

## Chunking contract: `paragraph_v1`

Implemented in **`src/memory-chunk.ts`**:

1. Strip YAML frontmatter using the same rules as `memory_recall` (`stripVaultFrontmatter` in `src/vault-markdown.ts`).
2. Split the indexable body on **two-or-more newlines** into paragraphs; trim each paragraph for chunk text while preserving offsets into the trimmed substring.
3. Paragraphs longer than **`CLAWQL_MEMORY_CHUNK_MAX_CHARS`** (default **2000**) are split into consecutive windows of at most that length (no overlap in v1).

## Runtime

- **Engine:** [sql.js](https://github.com/sql-js/sql.js/) (WASM). No native `node-gyp` modules; compatible with `npm ci --ignore-scripts` and the Distroless image build.
- **Recall:** When the DB is enabled, `memory_recall` **merges** stored `wikilink_edge` rows whose `to_resolved_path` is still present in the current scan into the in-memory graph (helps when the DB was populated from a wider scan than the current `CLAWQL_MEMORY_RECALL_SCAN_ROOT`). Optional **`CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`** rewrites the DB from the files touched in that recall (heavier). With **`CLAWQL_VECTOR_BACKEND=sqlite`** and embeddings configured, recall runs **cosine KNN** over `vault_chunk` rows. With **`CLAWQL_VECTOR_BACKEND=postgres`**, vectors are queried from **Postgres** (`clawql_memory_chunk_vector`, see **`src/vector-store/pgvector.ts`**).

### Postgres (`CLAWQL_VECTOR_BACKEND=postgres`)

Separate database (**`CLAWQL_VECTOR_DATABASE_URL`**). Extension **`vector`**, table **`clawql_memory_chunk_vector`** (`chunk_id` PK, `document_path`, `text`, `embedding vector(dim)`, `embedding_model`, `embedding_dim`, `updated_at`). Cosine retrieval uses **`<=>`** in SQL. Dimension defaults to **`CLAWQL_EMBEDDING_DIMENSION=1536`**; changing it after `CREATE TABLE` requires a manual migration if the table already exists.

## See also

- Epic **[#24](https://github.com/danielsmithdevelopment/ClawQL/issues/24)** and schema sub-issue **[#27](https://github.com/danielsmithdevelopment/ClawQL/issues/27)**.
- Vector direction: **[vector-search-design.md](vector-search-design.md)**.
- Vault semantics: **[memory-obsidian.md](memory-obsidian.md)**.
