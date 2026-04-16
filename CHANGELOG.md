# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MCP `ingest_external_knowledge` ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)):** stub tool + **`CLAWQL_EXTERNAL_INGEST=1`** opt-in for roadmap JSON (no network I/O). Documents how future bulk imports into the vault would align with **`memory_ingest`** / **`memory_recall`** / **`memory.db`**. See **[`docs/external-ingest.md`](docs/external-ingest.md)**.
- **Vault provider index ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)):** after successful **`memory_ingest`**, **`updateProviderIndexPage`** writes **`_INDEX_{Provider}.md`** under the recall scan root (default **`Memory/_INDEX_ClawQL.md`**) with **`[[wikilinks]]`** to scanned notes. **Content fingerprint** in an HTML comment skips rewrites when the list is unchanged (avoids NFS/git noise). Disable with **`CLAWQL_MEMORY_INDEX_PAGE=0`**; set **`CLAWQL_MEMORY_INDEX_PROVIDER`** for the label/filename. Module: **`src/memory-provider-index.ts`**.
- **Hybrid `memory_recall` (issues [#26](https://github.com/danielsmithdevelopment/ClawQL/issues/26), [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28)):** pluggable **vector backends** — **`CLAWQL_VECTOR_BACKEND=sqlite`** stores float32 vectors in **`vault_chunk.embedding`** (sql.js; in-process cosine KNN), or **`postgres`** stores vectors in **Postgres + pgvector** (`clawql_memory_chunk_vector`, cosine via `<=>`) using **`CLAWQL_VECTOR_DATABASE_URL`**. Same OpenAI-compatible **`/embeddings`** pipeline (**`CLAWQL_EMBEDDING_*`**). Dependency: **`pg`** for the Postgres backend.
- **Issue [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28) (operator / MCP):** **[`docs/memory-db-hybrid-implementation.md`](docs/memory-db-hybrid-implementation.md)** §7 now lists **`CLAWQL_VECTOR_*`**, **`CLAWQL_EMBEDDING_*`**, **`CLAWQL_MEMORY_VECTOR_*`**, optional **`CLAWQL_MCP_LOG_TOOLS`** (shape-only logging for **`memory_ingest`** / **`memory_recall`**), and **reserved** **`CLAWQL_CUCKOO_*`** (pending [#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)). **`.env.example`** documents the same.

### Changed

- **Docs:** **[`docs/memory-obsidian.md`](docs/memory-obsidian.md)**, **[`docs/vector-search-design.md`](docs/vector-search-design.md)**, **[`docs/memory-db-hybrid-implementation.md`](docs/memory-db-hybrid-implementation.md)**, and **[`docs/memory-db-schema.md`](docs/memory-db-schema.md)** now describe **`memory_recall`** as hybrid (lexical + optional OpenAI-compatible embeddings + wikilinks), **`vault_chunk`** vectors when enabled, and distinguish **shipped** vault vectors from **future** spec **`search`** semantics.
- **Hybrid memory architecture:** **[`docs/hybrid-memory-backends.md`](docs/hybrid-memory-backends.md)** documents SQLite-as-default beside vault files, optional Postgres for scale, versioned **`clawql_pg_schema_migrations`**, and hooks for future **Cuckoo** / **Merkle** data. **`embeddingVectorDimension()`** lives in **`memory-embedding.ts`**; stdio + HTTP entrypoints register **Postgres pool shutdown** on **`SIGINT`/`SIGTERM`**.
- **Vector backend parity:** with **`postgres`**, embeddings default to **dual-write** into **`vault_chunk.embedding`** (opt out with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). **`memory_recall`** tries **pgvector** first, then in-process ranking over **`memory.db`** BLOBs when present. **SQLite `memory.db` is still optional** (`CLAWQL_MEMORY_DB=0` or no vault disables it entirely).
- **`effectiveVectorBackend()`:** **`CLAWQL_VECTOR_BACKEND=postgres`** without **`CLAWQL_VECTOR_DATABASE_URL`** now **falls back to SQLite vectors** (with a one-time warning) instead of disabling embeddings. **[`docs/hybrid-memory-backends.md`](docs/hybrid-memory-backends.md)** documents tradeoffs (sqlite vs postgres, dual-write, fallback).

## [3.0.1] - 2026-04-16

### Fixed

- **Packaging:** `npm run build` now removes **`dist/`** before **`tsc`**, so deleted source files do not leave stale **`dist/*.js`** in the published tarball (fixes stray artifacts from the 3.0.0 refactor).

## [3.0.0] - 2026-04-16

### Breaking

- **Unified GraphQL only ([#34](https://github.com/danielsmithdevelopment/ClawQL/issues/34)):** The standalone **`clawql-graphql`** npm binary and split-process deployment using **`GRAPHQL_URL`** are removed. Single-spec **`execute`** always uses in-process OpenAPI→GraphQL; **`clawql-mcp-http`** exposes **`/graphql`** on the same port as **`/mcp`**. Docker Compose, Kubernetes, and Cloud Run templates deploy **one** workload. Remove any second GraphQL container/service and unset **`GRAPHQL_URL`**, **`CLAWQL_COMBINED_MODE`**, and **`CLAWQL_GRAPHQL_EXTERNAL_URL`** if you had added them during the migration period.

### Added

- **`memory.db`** (SQLite via **sql.js**) colocated with the vault: **`vault_document`**, **`vault_chunk`** (`paragraph_v1` chunking contract), and **`wikilink_edge`** rows; rebuilt after successful **`memory_ingest`**, merged into **`memory_recall`** wikilink traversal when enabled. Operator reference: **`docs/memory-db-schema.md`**.

## [2.0.0] - 2026-04-14

### Breaking

- **Default bundled API merge** (when no `CLAWQL_SPEC_PATH`, `CLAWQL_SPEC_URL`, `CLAWQL_DISCOVERY_URL`, `CLAWQL_SPEC_PATHS`, or `CLAWQL_PROVIDER` is set): the third merged vendor is now **GitHub** instead of **Jira**. Search hits and `operationId` availability change accordingly. The `default-multi-provider` preset matches this bundle. To approximate the previous mix or add Jira back, set **`CLAWQL_PROVIDER=all-providers`**, **`CLAWQL_PROVIDER=atlassian`**, and/or **`CLAWQL_SPEC_PATHS`** explicitly (see README and `.env.example`).

### Added

- **MCP tools** **`sandbox_exec`** (Cloudflare Sandbox via optional bridge Worker), **`memory_ingest`**, and **`memory_recall`** when **`CLAWQL_OBSIDIAN_VAULT_PATH`** is set (Obsidian vault; validated at startup when configured).
- **HTTP MCP**: CORS support for browser clients (`CLAWQL_CORS_ALLOW_ORIGIN`), Cloudflare Worker proxy notes, and related K8s/script alignment.
- **Per-vendor auth** for merged calls: prefer **`CLAWQL_GOOGLE_ACCESS_TOKEN`**, **`CLAWQL_CLOUDFLARE_API_TOKEN`**, and **`CLAWQL_GITHUB_TOKEN`** where applicable; **`CLAWQL_BEARER_TOKEN`** / **`GOOGLE_ACCESS_TOKEN`** remain as fallbacks (see `.env.example`).
- **ClawQL documentation site** under `website/` (branding, deployment notes).
- **Design docs** for future vector search (SQLite / Postgres backends).

### Changed

- **Centralized auth header** resolution for `execute` / REST paths (`auth-headers` helpers and tests).
- **Deploy templates**: Kubernetes starter and Cloud Run examples aligned with vault path and sandbox-related environment variables.

### Docs

- Full MCP surface documented (**`docs/mcp-tools.md`** and README cross-links); ClawQL Parity v1 marked complete for unified MCP vs ClawQL-Agent.

## [1.0.2] - 2026-04-06

- `execute`: default output fields for GitHub pulls; honor `fields` on REST and multi-spec paths (git `4f80846` and related PRs).

## [1.0.1] - 2026-04-06

- Patch release on npm between 1.0.0 and 1.0.2.

## [1.0.0] - 2026-03-26

- Initial public publish of **`clawql-mcp`**.
