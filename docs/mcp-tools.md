# MCP tools reference

ClawQL exposes **five** tools over MCP (stdio or Streamable HTTP). The **core** pair is **`search`** + **`execute`** for OpenAPI/Discovery APIs. The other three are **optional** and depend on configuration (vault path, Cloudflare Sandbox bridge).

| Tool | Requires | Purpose |
|------|----------|---------|
| `search` | Loaded spec | Rank operations by natural-language intent |
| `execute` | Single-spec: in-process OpenAPI→GraphQL; multi-spec: REST | Run one operation with lean responses |
| `sandbox_exec` | `CLAWQL_SANDBOX_BRIDGE_URL` + token | Run a snippet in a remote Cloudflare Sandbox via Worker bridge (not local execution) |
| `memory_ingest` | `CLAWQL_OBSIDIAN_VAULT_PATH` | Write Obsidian Markdown under `Memory/`; refreshes **`memory.db`** (see **[memory-db-schema.md](memory-db-schema.md)**) when enabled |
| `memory_recall` | `CLAWQL_OBSIDIAN_VAULT_PATH` | Keyword search + `[[wikilink]]` hops; optionally merges edges from **`memory.db`** and can resync the DB when **`CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`** |

See also: **[memory-obsidian.md](memory-obsidian.md)** (vault concepts), **[memory-db-schema.md](memory-db-schema.md)** (SQLite sidecar), **[README](../README.md)** (install, env tables), **[cloudflare/sandbox-bridge/README.md](../cloudflare/sandbox-bridge/README.md)** (Worker deploy).

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

**Env:** `CLAWQL_OBSIDIAN_VAULT_PATH` (directory must exist and be writable at startup).

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

Writes **`Memory/<slug>.md`** with YAML frontmatter and optional `[[wikilinks]]`. Duplicate payloads (same content hash) are skipped when appending.

---

## `memory_recall`

**Env:** `CLAWQL_OBSIDIAN_VAULT_PATH`, optional `CLAWQL_MEMORY_RECALL_*` (scan root, limits, depth, snippet size).

**Input:**

```json
{
  "query": "github rate limit pat",
  "limit": 10,
  "maxDepth": 2,
  "minScore": 1
}
```

Returns JSON with **`results[]`**: `path`, `score`, `depth`, `reason` (`keyword` | `link`), `snippet`, optional `linkFrom`. **No vector embeddings** — lexical match + graph expansion via wikilinks. See [issue #16](https://github.com/danielsmithdevelopment/ClawQL/issues/16) and [vector-search-design.md](vector-search-design.md) for planned semantic retrieval (SQLite + Postgres backends).
