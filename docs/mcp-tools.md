# MCP tools reference

ClawQL exposes **six** core+optional tools over MCP by default (stdio or Streamable HTTP), and a **seventh** — **`cache`** — when **`CLAWQL_ENABLE_CACHE=1`**. The **core** pair is **`search`** + **`execute`** for OpenAPI/Discovery APIs. The other defaults are **optional** and depend on configuration (vault path, Cloudflare Sandbox bridge, external ingest flag).

| Tool                        | Requires                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                    | Loaded spec                                               | Rank operations by natural-language intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `execute`                   | Single-spec: in-process OpenAPI→GraphQL; multi-spec: REST | Run one operation with lean responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sandbox_exec`              | `CLAWQL_SANDBOX_BRIDGE_URL` + token                       | Run a snippet in a remote Cloudflare Sandbox via Worker bridge (not local execution)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `memory_ingest`             | `CLAWQL_OBSIDIAN_VAULT_PATH`                              | Write Obsidian Markdown under `Memory/`; refreshes **`memory.db`** when enabled; optional **`_INDEX_*.md`** hub page ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)); when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`**, JSON may include **`merkleSnapshotBefore`**, **`merkleSnapshot`**, **`merkleRootChanged`**, **`cuckooMembershipReady`**                                                                                                                                                                                                                                                                                                                                                                              |
| `memory_recall`             | `CLAWQL_OBSIDIAN_VAULT_PATH`                              | Keyword search + `[[wikilink]]` hops; optionally merges edges from **`memory.db`**, optional **vector KNN** when **`CLAWQL_VECTOR_BACKEND`** is **`sqlite`** (BLOBs in **`memory.db`**) or **`postgres`** (**pgvector** + **`CLAWQL_VECTOR_DATABASE_URL`**) with **`CLAWQL_EMBEDDING_*`**; can resync the DB when **`CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`**; optional **`merkleSnapshot`** / **`cuckooVectorChunksDropped`** in JSON when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`** ([#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81)) |
| `ingest_external_knowledge` | **`CLAWQL_EXTERNAL_INGEST=1`**, vault path, optional fetch   | Bulk **Markdown** (`documents[]`) and optional **HTTPS** fetch (`source: url`, **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**); runs vault lock + **`memory.db`** sync like **`memory_ingest`** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)); no payload → roadmap preview                                                                                                                                                                                                                                                                                                                                                                     |
| `cache`                     | **`CLAWQL_ENABLE_CACHE=1`**                               | Ephemeral **in-process LRU** KV (set/get/delete/list/search); evicts LRU when full — **not** on disk; use **`memory_ingest`** / **`memory_recall`** for persisted vault memory ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75))                                                                                                                                                                                                                                                                                                                    |

See also: **[memory-obsidian.md](memory-obsidian.md)** (vault concepts), **[cursor-vault-memory.md](cursor-vault-memory.md)** (Cursor rule + skill for vault tools), **[cache-tool.md](cache-tool.md)** (**`cache`** vs **`memory_*`**, LRU), **[memory-db-schema.md](memory-db-schema.md)** (SQLite sidecar), **[external-ingest.md](external-ingest.md)** (bulk ingest stub), **[README](../README.md)** (install, env tables), **[deploy-k8s.md](deploy-k8s.md)** (Kubernetes Service ports **8080** + **50051** for HTTP MCP and gRPC), **[cloudflare/sandbox-bridge/README.md](../cloudflare/sandbox-bridge/README.md)** (Worker deploy).

---

## `cache` (optional)

**Full write-up:** **[cache-tool.md](cache-tool.md)** (vs vault memory, LRU semantics, multi-replica).

**Env:** **`CLAWQL_ENABLE_CACHE=1`** (or `true` / `yes`). **`CLAWQL_CACHE_MAX_VALUE_BYTES`** — max UTF-8 size per value (default **1048576**, cap **16 MiB**). **`CLAWQL_CACHE_MAX_ENTRIES`** — max distinct keys (default **10000**); least-recently-used keys are evicted when full (`get` / `set` refresh recency).

**Temporary session data only:** entries live in an **LRU `Map` in this process** — no disk, no vault. Restart or another replica has an empty cache. For **durable** notes and graph recall, use **`memory_ingest`** and **`memory_recall`**.

**Input (discriminated by `operation`):**

| `operation` | Fields                                                                          | Result                                                                |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `set`       | `key`, `value`                                                                  | `{ ok, key, evicted? }` (evicted = LRU keys dropped when at capacity) |
| `get`       | `key`                                                                           | `{ hit, key, value? }`                                                |
| `delete`    | `key`                                                                           | `{ deleted }`                                                         |
| `list`      | optional `prefix`, `limit` (default 100)                                        | `{ keys[] }` sorted                                                   |
| `search`    | `query` (substring, keys only, case-insensitive), optional `limit` (default 50) | `{ keys[] }`                                                          |

---

## `search`

**Input (conceptual):**

```json
{
  "query": "list kubernetes clusters in a project",
  "limit": 5
}
```

Returns ranked **`operationId`** candidates and metadata — no upstream HTTP.

---

## `execute`

**Input:**

```json
{
  "operationId": "run.projects.locations.services.list",
  "args": {
    "parent": "projects/my-proj/locations/us-central1",
    "pageSize": 10
  },
  "fields": ["name", "uri"]
}
```

`fields` is optional; omit for defaults. Single-spec mode uses in-process GraphQL (no separate proxy).

---

## `sandbox_exec`

Runs a snippet in an isolated **Cloudflare Sandbox** through a **Worker** you deploy (`cloudflare/sandbox-bridge`). The Node MCP process does not load the Sandbox SDK directly. The MCP tool is named **`sandbox_exec`** so it is not confused with editing or running code on the host machine; the JSON argument for the source text is still **`code`**.

**Env:** `CLAWQL_SANDBOX_BRIDGE_URL`, `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` (same value as Worker `BRIDGE_SECRET`), optional `CLAWQL_CLOUDFLARE_ACCOUNT_ID`, `CLAWQL_SANDBOX_*`.

**Input:**

```json
{
  "code": "print(2 + 2)",
  "language": "python",
  "sessionId": "thread-1",
  "persistenceMode": "session",
  "timeoutMs": 120000
}
```

`language`: `python` | `javascript` | `shell`.

---

## `memory_ingest`

**Env:** `CLAWQL_OBSIDIAN_VAULT_PATH` (directory must exist and be writable at startup). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: stderr logs **tool shape** only (e.g. title length), never note bodies.

**Input:**

```json
{
  "title": "Session 2026-04-15 API notes",
  "insights": "Use ETag when polling GitHub APIs.",
  "conversation": "User: …\nAssistant: …",
  "toolOutputs": "{ \"status\": 200 }",
  "wikilinks": ["GitHub API", "Rate limits"],
  "sessionId": "abc-123",
  "append": true
}
```

Writes **`Memory/<slug>.md`** with YAML frontmatter and optional `[[wikilinks]]`. Duplicate payloads (same content hash) are skipped when appending. When enabled (default), also maintains **`Memory/_INDEX_{Provider}.md`** (or under **`CLAWQL_MEMORY_RECALL_SCAN_ROOT`**) listing notes in that subtree — **`CLAWQL_MEMORY_INDEX_PAGE=0`** to disable; **`CLAWQL_MEMORY_INDEX_PROVIDER`** sets the label/filename (see **[memory-obsidian.md](memory-obsidian.md)**, [#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)).

After a successful, non-skipped write, **`memory.db`** is resynced. When **`CLAWQL_MERKLE_ENABLED=1`**, the tool result JSON can include **`merkleSnapshotBefore`** and **`merkleSnapshot`** (see **`memory_recall`** for field shapes) and **`merkleRootChanged`** when both are comparable. When **`CLAWQL_CUCKOO_ENABLED=1`** and the sidecar sync ran, **`cuckooMembershipReady`** is **`true`** (filter rebuilt over chunk ids).

---

## `memory_recall`

**Env:** `CLAWQL_OBSIDIAN_VAULT_PATH`, optional `CLAWQL_MEMORY_RECALL_*` (scan root, limits, depth, snippet size). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: stderr logs **tool shape** only (e.g. query character count), never query text.

**Input:**

```json
{
  "query": "github rate limit pat",
  "limit": 10,
  "maxDepth": 2,
  "minScore": 1
}
```

Returns JSON with **`results[]`**: `path`, `score`, `depth`, `reason` (`keyword` | `link` | `vector`), `snippet`, optional `linkFrom`. Lexical match + graph expansion via wikilinks; **optional vectors** when **`CLAWQL_VECTOR_BACKEND`** is set (**`sqlite`** or **`postgres`**) and an embedding API key is set — see README (`CLAWQL_EMBEDDING_*`, `CLAWQL_VECTOR_DATABASE_URL`, `CLAWQL_MEMORY_VECTOR_*`). **`sqlite`:** in-process cosine KNN over **`memory.db`** BLOBs. **`postgres`:** pgvector first; optional **dual-write** BLOBs in **`memory.db`** (default on; disable with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). When **`CLAWQL_MERKLE_ENABLED=1`**, the response includes **`merkleSnapshot`** (`rootHex`, `leafCount`, `treeHeight`, `builtAt`) or **`null`** if no snapshot row. When **`CLAWQL_CUCKOO_ENABLED=1`** and a membership filter is loaded, vector-ranked rows are filtered so **`chunk_id`** must appear in the Cuckoo filter (drops inconsistent/stale hits); **`cuckooVectorChunksDropped`** counts removed chunks. See [hybrid-memory-backends.md](hybrid-memory-backends.md), [vector-search-design.md](vector-search-design.md), [#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16), [#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81).

---

## `ingest_external_knowledge`

**Env:** **`CLAWQL_EXTERNAL_INGEST=1`** (must be exactly **`1`**) registers imports. **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** allows **`url`** mode (HTTPS fetch; **`http`** only for **`localhost`** / **`127.0.0.1`**). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: shape-only logging.

**Markdown import:** pass **`documents`**: `[{ "path": "Memory/imports/x.md", "markdown": "# …" }]` (up to **50** files, ~**2 MiB** each). **`dryRun`** defaults **`true`** — set **`dryRun: false`** to write. Paths must stay under the vault (no **`..`**) and end with **`.md`**.

**URL import:** **`source`: `"url"`**, **`url`**: `https://…`**, optional **`scope`**: vault-relative target **`.md`** (default **`Memory/external/<slug>.md`**). Requires **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**. Response bodies are capped (~**2 MiB**); content is stored in a fenced block with YAML frontmatter (`clawql_external_ingest`, `source_url`).

**No `documents` / `url`:** returns **`stub: true`** with **`roadmap[]`** (operator preview). When the vault has **`memory.db`**, Merkle/Cuckoo flags may add **`merkleSnapshot`** / **`cuckooMembershipReady`**.

Successful writes run **`syncMemoryDbForVaultScanRoot`** + **`_INDEX_*.md`** update (same as **`memory_ingest`**). See **[external-ingest.md](external-ingest.md)** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)).

---

## Optional tool flags (`CLAWQL_ENABLE_*` and related)

Boolean flags are parsed in one place — **[`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts)** ([GitHub #79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)) — so env wiring stays consistent. **Truthy** means `1`, `true`, or `yes` (case-insensitive), except where noted.

| Concern                | Env var(s)                                                         | Default | MCP tools / behavior                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gRPC MCP               | `ENABLE_GRPC`, `ENABLE_GRPC_REFLECTION`                            | off     | Same tools over gRPC (**`GRPC_PORT`**, optional reflection); see README and [`packages/mcp-grpc-transport/README.md`](../packages/mcp-grpc-transport/README.md). |
| External ingest        | `CLAWQL_EXTERNAL_INGEST`, optional `CLAWQL_EXTERNAL_INGEST_FETCH`  | off     | **`1`** enables `ingest_external_knowledge`; **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** allows URL fetch mode.                                                       |
| Obsidian vault         | `CLAWQL_OBSIDIAN_VAULT_PATH`                                       | unset   | Required for **`memory_ingest`** / **`memory_recall`** to write/search; see [memory-obsidian.md](memory-obsidian.md).                                            |
| Sandbox bridge         | `CLAWQL_SANDBOX_BRIDGE_URL`, `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` | unset   | **`sandbox_exec`** calls the Worker; missing URL/token returns a clear error from the handler.                                                                   |
| Vector / hybrid memory | `CLAWQL_VECTOR_BACKEND`, embedding + DB vars                       | off     | Optional **`memory_recall`** KNN; see README and [hybrid-memory-backends.md](hybrid-memory-backends.md).                                                         |
| **`cache` tool**       | `CLAWQL_ENABLE_CACHE`                                              | off     | [#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75): in-process LRU; **`CLAWQL_CACHE_MAX_VALUE_BYTES`**, **`CLAWQL_CACHE_MAX_ENTRIES`**.           |
| **Planned** schedule   | `CLAWQL_ENABLE_SCHEDULE`                                           | off     | [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76) — reserved.                                                                                    |
| **Planned** notify     | `CLAWQL_ENABLE_NOTIFY`                                             | off     | [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77) — reserved.                                                                                    |
| **Planned** vision     | `CLAWQL_ENABLE_VISION`                                             | off     | [#78](https://github.com/danielsmithdevelopment/ClawQL/issues/78) — reserved.                                                                                    |

---

## Planned: `schedule` (optional)

**Env (planned):** `CLAWQL_ENABLE_SCHEDULE` + related caps/paths — see [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76), [#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79).

The **`schedule`** tool will support persisted jobs (cron / interval / one-shot) with **typed actions**. One action kind is **synthetic HTTP/API checks** (assertions + history) as a **subset** of scheduling—see **[schedule-synthetic-checks.md](schedule-synthetic-checks.md)**. Failure notifications are intended to pair with **`notify`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)). ClawQL does not bundle third-party observability vendors; scheduled probes are defined and stored **in-process** with the same safety constraints as the rest of the server.
