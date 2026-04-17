# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### CI

- **Prettier autofix** job on **same-repo pull requests**: when the **Lint & format** job fails, applies **`npm run format`** and pushes a single commit **`style: apply Prettier [prettier-autofix]`** if there are diffs. **Loop guards:** job runs only when `lint` failed; skips if the actor is **`github-actions[bot]`**; skips if **`[prettier-autofix]`** is already in **HEAD**; does not commit when Prettier makes no changes. **Fork PRs** are excluded (token cannot push to forks).

### Changed

- **`memory_recall`:** when **`CLAWQL_MERKLE_ENABLED=1`**, JSON includes **`merkleSnapshot`**; when **`CLAWQL_CUCKOO_ENABLED=1`** and embeddings run, vector-ranked chunks are filtered by the Cuckoo membership filter with **`cuckooVectorChunksDropped`** ([#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81)).
- **Developer tooling:** root **`npm run format`** / **`format:check`** now includes the docs site: **`npm run format --prefix website`** (Prettier on **`website/`** `mdx`/`ts`/`tsx`). **`.prettierignore`** no longer skips all of **`website/`**—only build artifacts (**`.next/`**, **`node_modules/`**, etc.). CI runs **`npm ci --prefix website`** before **`format:check`** so site Prettier plugins resolve.
- **Codegen:** **`pregenerate-graphql`** and **`pregenerate-google-top50-graphql`** use **`tsx`** (not Bun). Added **`npm run graphql`** → **`tsx src/graphql-proxy.ts`** for the standalone GraphQL proxy documented in the README.
- **`cache` tool:** storage is **in-process only** (no SQLite / no `CLAWQL_CACHE_DB_PATH`). Durable memory remains **`memory_ingest`** / **`memory_recall`**.
- **`cache` tool:** **LRU** eviction when **`CLAWQL_CACHE_MAX_ENTRIES`** is reached (default **10_000**); `get` / `set` move keys to most-recently-used.

### Added

- **Cuckoo filter + Merkle snapshot** for hybrid `memory.db` ([#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25), [#37](https://github.com/danielsmithdevelopment/ClawQL/issues/37)): enable with **`CLAWQL_CUCKOO_ENABLED=1`** and **`CLAWQL_MERKLE_ENABLED=1`**; modules **`src/cuckoo-filter.ts`**, **`src/merkle-tree.ts`**, **`src/memory-artifacts.ts`**; helpers **`chunkIdMaybeInMemoryIndex`**, **`loadVaultMerkleSnapshotFromDb`**. Postgres migration **2** adds **`clawql_cuckoo_chunk_membership`** and **`clawql_vault_merkle`** when using **`CLAWQL_VECTOR_DATABASE_URL`**.
- **`cache` MCP tool** ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)): opt-in via **`CLAWQL_ENABLE_CACHE`**; operations **`set` / `get` / `delete` / `list` / `search`**; **in-process `Map` only** (not persisted — use **`memory_ingest`** / **`memory_recall`** for vault); **`CLAWQL_CACHE_MAX_VALUE_BYTES`** per value (default **1 MiB**). Implementation: [`src/clawql-cache.ts`](src/clawql-cache.ts).
- **`src/clawql-optional-flags.ts`**: Zod-validated optional feature flags (`ENABLE_GRPC`, `CLAWQL_EXTERNAL_INGEST`, planned **`CLAWQL_ENABLE_*`** for cache/schedule/notify/vision); **`src/external-ingest.ts`** uses the shared parser for **`CLAWQL_EXTERNAL_INGEST`**. See [#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79).

### Documentation

- **`docs/benchmarks/archive/`**: short summaries + script links for archived workflow runs (formerly root `gcp-multi-test.md`, `multi-provider-test.md`, `TEST_RESULTS_2026-03-19.md`, and **`docs/JIRA_WORKFLOW_TOKEN_RESULTS_2026-03-19.md`**); benchmark stats JSON **`workflowOutput.source`** now points at the archive note.
- **`docs/cache-tool.md`**: canonical **`cache`** vs **`memory_*`**, LRU semantics, env vars, multi-replica; cross-links from **`docs/mcp-tools.md`**, **`docs/memory-obsidian.md`**, **`docs/cursor-vault-memory.md`**, **`docs/deploy-k8s.md`**; website routes **`/cache`** and **`/tools`** (`website/src/app/cache`, `website/src/app/tools`) and nav/sitemap updated.
- **`docs/deploy-k8s.md`**: TLS/mTLS/mesh and observability notes for port **50051**; gRPC tracking remains on [#67](https://github.com/danielsmithdevelopment/ClawQL/issues/67).
- **`docs/mcp-tools.md`**: optional tool flags table + pointer to `clawql-optional-flags.ts`.

## [3.2.3] - 2026-04-16

### Fixed

- **Kubernetes:** **`dev`** and **`prod`** Kustomize overlays were patching **`clawql-mcp-http`** with **HTTP only**, so **gRPC 50051** was missing from the Service. Overlays now publish **`grpc` / 50051** like **base** and **local**, so **`model_context_protocol.Mcp`** is reachable on the Service IP without **`kubectl port-forward`**.
- **`mcp-grpc-transport`:** decode **`google.protobuf.Struct`** when **`fields`** is a **`Map`** (not only a plain object), so **`CallTool`** tool arguments such as **`memory_recall`** `query` are not dropped on the server.
- **`mcp-grpc-transport`:** patch **`@grpc/proto-loader`** **`FileDescriptorProto`** output used for **`grpc.reflection.v1.ServerReflection`** so strict clients (**grpcurl**, **`jhump/protoreflect`**) resolve map entries, cross-package **`type_name`**, and well-known type dependencies correctly.

### Added

- **`scripts/grpc-memory-recall.mjs`:** call **`memory_recall`** via **`model_context_protocol.Mcp/CallTool`** with **protobufjs**-encoded **`google.protobuf.Struct`** tool arguments (avoids losing nested **`Value`** fields when using **`@grpc/proto-loader`** serialization alone).
- **Tests:** **`src/grpc-memory-tools.test.ts`** exercises **`memory_ingest`** and **`memory_recall`** over gRPC **`CallTool`** (protobufjs request encoding, temp vault + minimal OpenAPI spec).
- **`packages/mcp-grpc-transport`:** **`proto-loader-reflection-patch`** module and tests (**`proto-loader-reflection-patch.test.ts`**, **`mcp-protobuf-struct.test.ts`**).
- **Documentation site (`website/`):** **`sitemap.xml`**, **`robots.txt`**, canonical site URL helper (**`NEXT_PUBLIC_SITE_URL`** / **`VERCEL_URL`**), richer page metadata for SEO, **gRPC and Kubernetes** reference card.

### Changed

- **Dependency:** **`mcp-grpc-transport`** **`^0.1.2`** (reflection descriptor patches; **protobufjs** for **`Struct`** tooling in scripts and tests).

### Documentation

- **`docs/deploy-k8s.md`**, **`docker/README.md`**, root **`README.md`**, **`packages/mcp-grpc-transport/README.md`**: document dual **http** + **grpc** Service ports and when port-forward is still useful.
- **Cursor:** **`.cursor/rules/clawql-vault-memory.mdc`**, **`.cursor/skills/clawql-vault-memory/`**, and **`docs/cursor-vault-memory.md`** — project rule, skill, and guide for **`memory_ingest`** / **`memory_recall`** in Cursor.

## [3.2.1] - 2026-04-17

### Fixed

- **Docker / Kubernetes:** the Distroless runtime copied **`node_modules`** but not **`packages/mcp-grpc-transport`**, so the workspace symlink **`node_modules/mcp-grpc-transport`** pointed at a missing path and **`clawql-mcp-http`** crashed with **`ERR_MODULE_NOT_FOUND`**. The Dockerfile now copies **`packages/mcp-grpc-transport`** next to **`node_modules`**.

## [3.2.0] - 2026-04-16

### Added

- **Optional gRPC MCP ([#67](https://github.com/danielsmithdevelopment/ClawQL/issues/67)):** depends on **[`mcp-grpc-transport`](https://www.npmjs.com/package/mcp-grpc-transport)** **`^0.1.0`** (also developed in [`packages/mcp-grpc-transport`](packages/mcp-grpc-transport)). When **`ENABLE_GRPC=1`**, **`clawql-mcp-http`** starts **`maybeStartGrpcMcpServer`** with a shared **`createRegisteredMcpServer`** factory so stdio, Streamable HTTP, and gRPC expose the same tools. Listens on **`GRPC_PORT`** (default **50051**): **`grpc.health.v1.Health`**, **`model_context_protocol.Mcp`**, **`mcp.transport.v1.Mcp.Session`**; optional **`ENABLE_GRPC_REFLECTION=1`**. See root **[README](README.md)** and **[`packages/mcp-grpc-transport/README.md`](packages/mcp-grpc-transport/README.md)**.
- **`mcp-grpc-transport` — `Mcp.Session` (JSON-RPC stream):** **`JsonRpcLine`** optional **`related_request_id`** / **`resumption_token`**; **`GrpcMcpSessionTransport`** supplies **`MessageExtraInfo.requestInfo.headers`** and **`authInfo`** when **`Authorization: Bearer`** is present; **`sessionId`** from **`mcp-session-id`** metadata.
- **`mcp-grpc-transport` — protobuf MCP parity:** **`CancelTask`**, list **pagination**, **`common.log_level`**, **`notifications/message`** → **`log_message`**, metadata routing hints, **`CallTool`** **`task_id`** / progress, **`dependent_requests`** helpers (**`runUnaryWithDependents`**, **`fulfillDependentRequests`**), etc.
- **Kustomize:** **`docker/kustomize/overlays/grpc-enabled/`** sets **`ENABLE_GRPC=1`** and uses **Kubernetes `grpc`** readiness/liveness probes on port **50051**.

### Changed

- **`clawql-mcp` dependency:** **`mcp-grpc-transport`** is **`^0.1.0`** from the npm registry (workspace-compatible for local **`npm install`** in this repo).

## [3.1.0] - 2026-04-16

### Added

- **MCP `ingest_external_knowledge` ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)):** stub tool + **`CLAWQL_EXTERNAL_INGEST=1`** opt-in for roadmap JSON (no network I/O). Documents how future bulk imports into the vault would align with **`memory_ingest`** / **`memory_recall`** / **`memory.db`**. See **[`docs/external-ingest.md`](docs/external-ingest.md)**.
- **Vault provider index ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)):** after successful **`memory_ingest`**, **`updateProviderIndexPage`** writes **`_INDEX_{Provider}.md`** under the recall scan root (default **`Memory/_INDEX_ClawQL.md`**) with **`[[wikilinks]]`** to scanned notes. **Content fingerprint** in an HTML comment skips rewrites when the list is unchanged (avoids NFS/git noise). Disable with **`CLAWQL_MEMORY_INDEX_PAGE=0`**; set **`CLAWQL_MEMORY_INDEX_PROVIDER`** for the label/filename. Module: **`src/memory-provider-index.ts`**.
- **Hybrid `memory_recall` (issues [#26](https://github.com/danielsmithdevelopment/ClawQL/issues/26), [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28)):** pluggable **vector backends** — **`CLAWQL_VECTOR_BACKEND=sqlite`** stores float32 vectors in **`vault_chunk.embedding`** (sql.js; in-process cosine KNN), or **`postgres`** stores vectors in **Postgres + pgvector** (`clawql_memory_chunk_vector`, cosine via `<=>`) using **`CLAWQL_VECTOR_DATABASE_URL`**. Same OpenAI-compatible **`/embeddings`** pipeline (**`CLAWQL_EMBEDDING_*`**). Dependency: **`pg`** for the Postgres backend.
- **Issue [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28) (operator / MCP):** **[`docs/memory-db-hybrid-implementation.md`](docs/memory-db-hybrid-implementation.md)** §7 now lists **`CLAWQL_VECTOR_*`**, **`CLAWQL_EMBEDDING_*`**, **`CLAWQL_MEMORY_VECTOR_*`**, optional **`CLAWQL_MCP_LOG_TOOLS`** (shape-only logging for **`memory_ingest`** / **`memory_recall`**), and **reserved** **`CLAWQL_CUCKOO_*`** (pending [#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)). **`.env.example`** documents the same.

### Changed

- **CI & supply chain:** ESLint + Prettier for `src/` and selected docs; Vitest **coverage** in CI; GitHub Actions pinned to commit SHAs; **Dependabot** for npm and GitHub Actions; **CodeQL** (JavaScript/TypeScript) on push/PR + weekly; weekly **`npm audit --audit-level=high`** (manual dispatch supported). **`npm audit fix`** applied so the audit job starts green. **Layout:** lint and **ShellCheck + actionlint** run in parallel; the **test matrix** waits for both (**fail early**); matrix **`fail-fast: true`** cancels remaining Node versions on first failure; **ESLint / Prettier** use restored caches in CI; **CodeQL** stays in its own workflow so **scheduled** scans do not run the full matrix.
- **Dependencies (major):** TypeScript 6, ESLint 10, Zod 4, Express 5 (aligned with **`@modelcontextprotocol/sdk`**), Prettier 3.8, **`@graphql-mesh/utils`** and **graphql** patch bumps; **GitHub Actions** pinned to **checkout** v6, **setup-node** v6, **codeql-action** v4; dev **`@types/node`** 22. MCP **`execute`** tool args use **`z.record(z.string(), z.unknown())`** for Zod 4.
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
