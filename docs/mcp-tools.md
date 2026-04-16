# MCP tools reference

ClawQL exposes **six** tools over MCP (stdio or Streamable HTTP). The **core** pair is **`search`** + **`execute`** for OpenAPI/Discovery APIs. The other four are **optional** and depend on configuration (vault path, Cloudflare Sandbox bridge, external ingest flag).

| Tool                        | Requires                                                  | Purpose                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                    | Loaded spec                                               | Rank operations by natural-language intent                                                                                                                                                                                                                                                                                                                |
| `execute`                   | Single-spec: in-process OpenAPI→GraphQL; multi-spec: REST | Run one operation with lean responses                                                                                                                                                                                                                                                                                                                     |
| `sandbox_exec`              | `CLAWQL_SANDBOX_BRIDGE_URL` + token                       | Run a snippet in a remote Cloudflare Sandbox via Worker bridge (not local execution)                                                                                                                                                                                                                                                                      |
| `memory_ingest`             | `CLAWQL_OBSIDIAN_VAULT_PATH`                              | Write Obsidian Markdown under `Memory/`; refreshes **`memory.db`** when enabled; optional **`_INDEX_*.md`** hub page ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38))                                                                                                                                                                  |
| `memory_recall`             | `CLAWQL_OBSIDIAN_VAULT_PATH`                              | Keyword search + `[[wikilink]]` hops; optionally merges edges from **`memory.db`**, optional **vector KNN** when **`CLAWQL_VECTOR_BACKEND`** is **`sqlite`** (BLOBs in **`memory.db`**) or **`postgres`** (**pgvector** + **`CLAWQL_VECTOR_DATABASE_URL`**) with **`CLAWQL_EMBEDDING_*`**; can resync the DB when **`CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`** |
| `ingest_external_knowledge` | Optional vault for future writes                          | **Stub:** roadmap for bulk import (Notion, Confluence, …) into the vault; set **`CLAWQL_EXTERNAL_INGEST=1`** for preview JSON ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40))                                                                                                                                                         |

See also: **[memory-obsidian.md](memory-obsidian.md)** (vault concepts), **[memory-db-schema.md](memory-db-schema.md)** (SQLite sidecar), **[external-ingest.md](external-ingest.md)** (bulk ingest stub), **[README](../README.md)** (install, env tables), **[cloudflare/sandbox-bridge/README.md](../cloudflare/sandbox-bridge/README.md)** (Worker deploy).

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

Returns JSON with **`results[]`**: `path`, `score`, `depth`, `reason` (`keyword` | `link` | `vector`), `snippet`, optional `linkFrom`. Lexical match + graph expansion via wikilinks; **optional vectors** when **`CLAWQL_VECTOR_BACKEND`** is set (**`sqlite`** or **`postgres`**) and an embedding API key is set — see README (`CLAWQL_EMBEDDING_*`, `CLAWQL_VECTOR_DATABASE_URL`, `CLAWQL_MEMORY_VECTOR_*`). **`sqlite`:** in-process cosine KNN over **`memory.db`** BLOBs. **`postgres`:** pgvector first; optional **dual-write** BLOBs in **`memory.db`** (default on; disable with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). See [hybrid-memory-backends.md](hybrid-memory-backends.md), [vector-search-design.md](vector-search-design.md), [#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16).

---

## `ingest_external_knowledge`

**Env:** **`CLAWQL_EXTERNAL_INGEST=1`** enables **stub** responses (still **no** HTTP or file writes). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: shape-only logging.

**Input (conceptual):**

```json
{
  "source": "notion",
  "dryRun": true,
  "scope": "workspace-or-repo-id"
}
```

Returns JSON: when disabled, **`ok: false`** with **`hint`**; when enabled, **`ok: true`**, **`stub: true`**, **`roadmap[]`**, **`relatedIssues`**. Future imports would land under the vault like **`memory_ingest`** so **`memory_recall`** can find them. See **[external-ingest.md](external-ingest.md)** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)).
