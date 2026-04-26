# MCP tools reference

ClawQL exposes **six** core+optional tools over MCP by default (stdio or Streamable HTTP). Additional optional tools include **`cache`** when **`CLAWQL_ENABLE_CACHE=1`**, **`audit`** when **`CLAWQL_ENABLE_AUDIT=1`** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)), **`schedule`** when **`CLAWQL_ENABLE_SCHEDULE=1`** ([#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76)), **`notify`** when **`CLAWQL_ENABLE_NOTIFY=1`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)), **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)), and the three **`ouroboros_*`** tools when **`CLAWQL_ENABLE_OUROBOROS=1`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). The **core** pair is **`search`** + **`execute`** for OpenAPI/Discovery APIs. The other defaults are **optional** and depend on configuration (vault path, Cloudflare Sandbox bridge, external ingest flag).

| Tool                                                                                                     | Requires                                                                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                                                                                                 | Loaded spec                                                                                              | Rank operations by natural-language intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `execute`                                                                                                | Single-spec: in-process OpenAPI→GraphQL; multi-spec: REST                                                | Run one operation with lean responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sandbox_exec`                                                                                           | `CLAWQL_SANDBOX_BRIDGE_URL` + token                                                                      | Run a snippet in a remote Cloudflare Sandbox via Worker bridge (not local execution)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `memory_ingest`                                                                                          | `CLAWQL_OBSIDIAN_VAULT_PATH`                                                                             | Write Obsidian Markdown under `Memory/`; optional **`enterpriseCitations`** (short Onyx-style rows, [#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)); refreshes **`memory.db`** when enabled; optional **`_INDEX_*.md`** hub page ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)); when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`**, JSON may include **`merkleSnapshotBefore`**, **`merkleSnapshot`**, **`merkleRootChanged`**, **`cuckooMembershipReady`**                                                    |
| `memory_recall`                                                                                          | `CLAWQL_OBSIDIAN_VAULT_PATH`                                                                             | Keyword search + `[[wikilink]]` hops; optionally merges edges from **`memory.db`**, optional **vector KNN** when **`CLAWQL_VECTOR_BACKEND`** is **`sqlite`** (BLOBs in **`memory.db`**) or **`postgres`** (**pgvector** + **`CLAWQL_VECTOR_DATABASE_URL`**) with **`CLAWQL_EMBEDDING_*`**; can resync the DB when **`CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1`**; optional **`merkleSnapshot`** / **`cuckooVectorChunksDropped`** in JSON when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`** ([#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81)) |
| `ingest_external_knowledge`                                                                              | **`CLAWQL_EXTERNAL_INGEST=1`**, vault path, optional fetch                                               | Bulk **Markdown** (`documents[]`) and optional **HTTPS** fetch (`source: url`, **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**); runs vault lock + **`memory.db`** sync like **`memory_ingest`** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)); no payload → roadmap preview                                                                                                                                                                                                                                                                               |
| `cache`                                                                                                  | **`CLAWQL_ENABLE_CACHE=1`**                                                                              | Ephemeral **in-process LRU** KV (set/get/delete/list/search); evicts LRU when full — **not** on disk; use **`memory_ingest`** / **`memory_recall`** for persisted vault memory ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75))                                                                                                                                                                                                                                                                                                                    |
| `audit`                                                                                                  | **`CLAWQL_ENABLE_AUDIT=1`**                                                                              | In-process **ring buffer** of structured events (append/list/clear) — **not** on disk; not compliance-grade alone; use **`memory_ingest`** for durable trails ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89))                                                                                                                                                                                                                                                                                                                                     |
| `schedule`                                                                                               | **`CLAWQL_ENABLE_SCHEDULE=1`**                                                                           | Persisted schedule jobs (`create/list/get/delete/trigger`) with typed actions; v1 action kind is **synthetic HTTP checks** (`action.kind: "synthetic"`) with assertion-based pass/fail and run history ([#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76), [schedule-synthetic-checks.md](schedule-synthetic-checks.md))                                                                                                                                                                                                                              |
| `notify`                                                                                                 | **`CLAWQL_ENABLE_NOTIFY=1`**, Slack spec in merge, bot token                                             | Slack **`chat.postMessage`** wrapper for workflow milestones and completion signals ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); same auth as **`execute`** on **`slack`** (`CLAWQL_SLACK_TOKEN`, …)                                                                                                                                                                                                                                                                                                                                          |
| `knowledge_search_onyx`                                                                                  | **`CLAWQL_ENABLE_ONYX=1`**, **`onyx`** in loaded merge, **`ONYX_BASE_URL`**, Bearer token                | Onyx **`POST /search/send-search-message`** wrapper for semantic document search ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); same auth as **`execute`** on **`onyx`** (`ONYX_API_TOKEN`, …)                                                                                                                                                                                                                                                                                                                                                |
| `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`, `ouroboros_get_lineage_status` | **`CLAWQL_ENABLE_OUROBOROS=1`**; optional **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events | **clawql-ouroboros** MCP hooks ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)): seed-from-document, run evolutionary loop, read lineage. Without **`CLAWQL_OUROBOROS_DATABASE_URL`**, events stay in-memory ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)).                                                                                                                                                                                                                                                              |

See also: **[memory-obsidian.md](memory-obsidian.md)** (vault concepts), **[integrations/cursor-vault-memory.md](integrations/cursor-vault-memory.md)** (Cursor rule + skill for vault tools), **[cache-tool.md](cache-tool.md)** (**`cache`** vs **`memory_*`**, LRU), **[notify-tool.md](notify-tool.md)** (**`notify`** Slack guide + examples), **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** (**`knowledge_search_onyx`** Onyx guide + examples), **[backlog/notify-tool-test-backlog.md](backlog/notify-tool-test-backlog.md)** (future **`notify`** test issues), **[enterprise-mcp-tools.md](enterprise-mcp-tools.md)** (audit / metrics / governance roadmap), **[memory-db-schema.md](memory-db-schema.md)** (SQLite sidecar), **[external-ingest.md](external-ingest.md)** (bulk ingest stub), **[clawql-ouroboros.md](clawql-ouroboros.md)** (evolutionary-loop library + MCP hook shapes), **[README](../README.md)** (install, env tables), **[deployment/deploy-k8s.md](deployment/deploy-k8s.md)** (Kubernetes Service ports **8080** + **50051** for HTTP MCP and gRPC), **[cloudflare/sandbox-bridge/README.md](../cloudflare/sandbox-bridge/README.md)** (Worker deploy).

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

## `audit` (optional)

**Full write-up:** **[enterprise-mcp-tools.md](enterprise-mcp-tools.md)** (threat model, future metrics/governance).

**Env:** **`CLAWQL_ENABLE_AUDIT=1`** (or `true` / `yes`). **`CLAWQL_AUDIT_MAX_ENTRIES`** — max events retained (default **500**, cap **50_000**); oldest entries drop when over capacity.

**Not durable:** the buffer is **in RAM only** — use **`memory_ingest`** for vault-backed or reviewable trails.

**Input:**

| `operation` | Fields                                                               | Result                                 |
| ----------- | -------------------------------------------------------------------- | -------------------------------------- |
| `append`    | `category`, `action`, `summary` (required), optional `correlationId` | `{ ok, total, dropped }`               |
| `list`      | optional `limit` (default 20, max 100)                               | `{ ok, total, maxEntries, entries[] }` |
| `clear`     | —                                                                    | `{ ok, cleared }`                      |

---

## `notify` (optional)

**Full write-up (setup, `notify` vs `execute`, examples, errors):** **[notify-tool.md](notify-tool.md)** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)).

**Env:** **`CLAWQL_ENABLE_NOTIFY=1`** (or `true` / `yes`). The **loaded OpenAPI index** must include Slack’s **`chat_postMessage`** operation (bundled id **`slack`** — e.g. **`CLAWQL_PROVIDER=slack`**, **`CLAWQL_BUNDLED_PROVIDERS`** that lists **`slack`**, or **`all-providers`**). Authenticate like **`execute`** on **`slack`**: **`CLAWQL_SLACK_TOKEN`**, **`SLACK_BOT_TOKEN`**, **`SLACK_TOKEN`**, **`CLAWQL_SLACK_BOT_TOKEN`**, or a **`slack`** entry in **`CLAWQL_PROVIDER_AUTH_JSON`** (see **`src/auth-headers.ts`**). Minimum scope **`chat:write`**.

**Behavior:** builds the same request as **`execute`** with **`operationId`** **`chat_postMessage`** and `application/x-www-form-urlencoded` body. Default response trimming keeps **`ok`**, **`error`**, **`channel`**, **`ts`**, **`message`**, **`warning`** so Slack **`ok:false`** payloads still include the API **`error`** code before **`notify`** remaps the body. If Slack returns HTTP 200 with **`"ok": false`**, the tool surfaces that as an **`error`** JSON object (Slack’s **`error`** code plus the parsed body under **`slack`**) instead of treating it as success.

**Example (minimal):**

```json
{
  "channel": "C0123456789",
  "text": "✅ *Invoice batch* complete — 14 files → Paperless doc <https://paperless.example/documents/5102/detail|#5102>."
}
```

**Input (required + common optional):**

| Field             | Required | Notes                                                                                    |
| ----------------- | -------- | ---------------------------------------------------------------------------------------- |
| `channel`         | yes      | Channel ID (`C…` / `G…` / `D…`), or **`#name`** for public channels the bot is in.       |
| `text`            | yes      | Message body; embed Onyx / Paperless / doc links inline for workflow summaries.          |
| `thread_ts`       | no       | Reply in a thread.                                                                       |
| `blocks`          | no       | JSON **string** of Block Kit blocks (Slack form field).                                  |
| `attachments`     | no       | JSON **string** of legacy attachments.                                                   |
| `username`        | no       | Bot display name override.                                                               |
| `icon_emoji`      | no       | Bot icon emoji.                                                                          |
| `icon_url`        | no       | Bot icon URL.                                                                            |
| `mrkdwn`          | no       | Set **`false`** to disable mrkdwn.                                                       |
| `unfurl_links`    | no       | Slack unfurl toggles.                                                                    |
| `unfurl_media`    | no       |                                                                                          |
| `reply_broadcast` | no       | Thread reply visibility.                                                                 |
| `parse`           | no       | Slack **`parse`** mode.                                                                  |
| `link_names`      | no       | Link `#channels` and `@users`.                                                           |
| `as_user`         | no       | Post as the authed user instead of the bot when **`true`**.                              |
| `fields`          | no       | Same as **`execute`** `fields` — top-level response keys only (multi-spec: REST shapes). |

---

## `knowledge_search_onyx` (optional)

**Full write-up (setup, wrapper vs `execute`, `memory_ingest` / `notify` pairing, examples, errors):** **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)).

**Env:** **`CLAWQL_ENABLE_ONYX=1`** (or `true` / `yes`). The **loaded OpenAPI index** must include the **`onyx`** bundled provider (operation id **`onyx_send_search_message`**, merged as **`onyx::onyx_send_search_message`** when **`onyx`** is part of a multi-spec merge — e.g. default **`all-providers`**, or **`CLAWQL_BUNDLED_PROVIDERS`** listing **`onyx`**, or **`CLAWQL_PROVIDER=onyx`**). Set **`ONYX_BASE_URL`** to your Onyx **API root** (often ends with **`/api`**). Authenticate like **`execute`** on **`onyx`**: **`ONYX_API_TOKEN`**, **`CLAWQL_ONYX_API_TOKEN`**, or a **`onyx`** entry in **`CLAWQL_PROVIDER_AUTH_JSON`** (see **`src/auth-headers.ts`**).

**Behavior:** resolves the correct **`operationId`** (`onyx::…` or single-spec), maps **`query`** → **`search_query`**, sets **`stream`: false**, defaults **`num_hits`** / **`include_content`**, then delegates to the same path as **`execute`** (multi-spec **REST**). Optional **`fields`** applies **top-level** JSON key filtering like **`execute`**.

**Example (minimal):**

```json
{
  "query": "Q1 2026 pricing approval workflow"
}
```

**Input (primary fields):**

| Field                 | Required | Notes                                                          |
| --------------------- | -------- | -------------------------------------------------------------- |
| `query`               | yes      | Maps to Onyx **`search_query`**.                               |
| `num_hits`            | no       | Default **15**; max **100**.                                   |
| `include_content`     | no       | Default **`true`** when omitted.                               |
| `stream`              | no       | Must be **`false`** or omitted.                                |
| `run_query_expansion` | no       | Default **`false`**.                                           |
| `hybrid_alpha`        | no       | Optional float for hybrid retrieval.                           |
| `filters`             | no       | Optional object; shape is Onyx-version-specific.               |
| `tenant_id`           | no       | Optional multi-tenant query parameter.                         |
| `fields`              | no       | Same as **`execute`** `fields` — top-level response keys only. |

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

**Env:** `CLAWQL_OBSIDIAN_VAULT_PATH` (directory must exist and be writable at startup). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: stderr logs **tool shape** only (e.g. title length), never note bodies. For **large** tool bodies without sending megabytes in MCP tool JSON, see **`toolOutputsFile`** and **`CLAWQL_MEMORY_INGEST_FILE_*`** below.

**Input:**

```json
{
  "title": "Session 2026-04-15 API notes",
  "insights": "Use ETag when polling GitHub APIs.",
  "conversation": "User: …\nAssistant: …",
  "toolOutputs": "{ \"status\": 200 }",
  "toolOutputsFile": "docs/small-snippet.md",
  "enterpriseCitations": [
    {
      "title": "Refund policy",
      "url": "https://intranet.example/doc/1",
      "document_id": "onyx-42",
      "snippet": "VP approval required for enterprise refunds."
    }
  ],
  "wikilinks": ["GitHub API", "Rate limits"],
  "sessionId": "abc-123",
  "append": true
}
```

**`enterpriseCitations`:** Optional array (max **30** rows) of short citation fields for vault-safe trails after enterprise search — e.g. chaining **`knowledge_search_onyx`** → **`memory_ingest`** ([#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)). See **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** §4 and **`enterpriseCitationsFromOnyxSearchToolText`** in **`src/enterprise-citations.ts`**.

**`toolOutputs` vs `toolOutputsFile`:** Use **`toolOutputs`** (or an array) for text that fits comfortably in a single tool call. Use **`toolOutputsFile`** for **large** verbatim text: the ClawQL **server** reads UTF-8 from that path on its filesystem and treats it as **`toolOutputs`**. The MCP only carries a **short path string**—solving Cursor/agent payload limits for very large files. The path may be **absolute** or **relative to `process.cwd()`** (typically the ClawQL repo root in dev). If both **`toolOutputsFile`** and **`toolOutputs`** are set, the **file wins** (inline body is ignored). A short line in the new section’s **Insights** notes the server read.

**Allowlist (security):** Reads are only allowed for files that resolve under **`CLAWQL_MEMORY_INGEST_FILE_ROOTS`** (comma- or newline-separated **absolute** directory prefixes, each resolved with **`realpath`**). If **unset**, the only allowed root is **realpath(`process.cwd()`)**. Set **`CLAWQL_MEMORY_INGEST_FILE=0`** (or `false` / `off` / `no`) to **disable** all `toolOutputsFile` reads. Max bytes: **`CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES`** (default **10_000_000**). The target must be a **regular** file. See also **`.env.example`**.

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

**URL import:** **`source`: `"url"`**, **`url`**: `https://…`**, optional **`scope`**: vault-relative target **`.md`** (default **`Memory/external/<slug>.md`**). Requires **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**. Response bodies are capped (~**2 MiB\*\*); content is stored in a fenced block with YAML frontmatter (`clawql_external_ingest`, `source_url`).

**No `documents` / `url`:** returns **`stub: true`** with **`roadmap[]`** (operator preview). When the vault has **`memory.db`**, Merkle/Cuckoo flags may add **`merkleSnapshot`** / **`cuckooMembershipReady`**.

Successful writes run **`syncMemoryDbForVaultScanRoot`** + **`_INDEX_*.md`** update (same as **`memory_ingest`**). See **[external-ingest.md](external-ingest.md)** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)).

---

## Optional tool flags (`CLAWQL_ENABLE_*` and related)

Boolean flags are parsed in one place — **[`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts)** ([GitHub #79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)) — so env wiring stays consistent. **Truthy** means `1`, `true`, or `yes` (case-insensitive), except where noted.

| Concern                          | Env var(s)                                                                                                                                     | Default                   | MCP tools / behavior                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gRPC MCP                         | `ENABLE_GRPC`, `ENABLE_GRPC_REFLECTION`                                                                                                        | off                       | Same tools over gRPC (**`GRPC_PORT`**, optional reflection); see README and [`packages/mcp-grpc-transport/README.md`](../packages/mcp-grpc-transport/README.md).                                                                                                                                                                |
| External ingest                  | `CLAWQL_EXTERNAL_INGEST`, optional `CLAWQL_EXTERNAL_INGEST_FETCH`                                                                              | off                       | **`1`** enables `ingest_external_knowledge`; **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** allows URL fetch mode.                                                                                                                                                                                                                        |
| Obsidian vault                   | `CLAWQL_OBSIDIAN_VAULT_PATH`                                                                                                                   | unset                     | Required for **`memory_ingest`** / **`memory_recall`** to write/search; see [memory-obsidian.md](memory-obsidian.md).                                                                                                                                                                                                           |
| **`memory_ingest` file**         | `CLAWQL_MEMORY_INGEST_FILE` (`0` disables), `CLAWQL_MEMORY_INGEST_FILE_ROOTS` (allowlist; default: cwd), `CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES` | see § **`memory_ingest`** | Optional **server-side** read for **`toolOutputsFile`**; large bodies without large MCP tool JSON.                                                                                                                                                                                                                              |
| Sandbox bridge                   | `CLAWQL_SANDBOX_BRIDGE_URL`, `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`                                                                             | unset                     | **`sandbox_exec`** calls the Worker; missing URL/token returns a clear error from the handler.                                                                                                                                                                                                                                  |
| Vector / hybrid memory           | `CLAWQL_VECTOR_BACKEND`, embedding + DB vars                                                                                                   | off                       | Optional **`memory_recall`** KNN; see README and [hybrid-memory-backends.md](hybrid-memory-backends.md).                                                                                                                                                                                                                        |
| **`cache` tool**                 | `CLAWQL_ENABLE_CACHE`                                                                                                                          | off                       | [#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75): in-process LRU; **`CLAWQL_CACHE_MAX_VALUE_BYTES`**, **`CLAWQL_CACHE_MAX_ENTRIES`**.                                                                                                                                                                          |
| **`audit` tool**                 | `CLAWQL_ENABLE_AUDIT`                                                                                                                          | off                       | [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89): in-process ring buffer; **`CLAWQL_AUDIT_MAX_ENTRIES`**.                                                                                                                                                                                                      |
| **`schedule` tool**              | `CLAWQL_ENABLE_SCHEDULE`, optional `CLAWQL_SCHEDULE_*` caps/path                                                                               | off                       | [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76): persisted jobs + synthetic checks (`trigger` supports `dry_run`).                                                                                                                                                                                            |
| **`notify` tool**                | `CLAWQL_ENABLE_NOTIFY`                                                                                                                         | off                       | [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77): Slack **`chat.postMessage`** when the Slack spec is loaded + bot token.                                                                                                                                                                                      |
| **`knowledge_search_onyx` tool** | `CLAWQL_ENABLE_ONYX`, **`ONYX_BASE_URL`**, **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** (or **`CLAWQL_PROVIDER_AUTH_JSON`** `onyx`)      | off                       | [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118): Onyx document search; **`onyx`** must appear in the loaded merge.                                                                                                                                                                                          |
| **`ouroboros_*` tools**          | `CLAWQL_ENABLE_OUROBOROS`; optional `CLAWQL_OUROBOROS_DATABASE_URL` or split `CLAWQL_OUROBOROS_DB_*` vars                                      | off                       | [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141) / [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142): **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`**; Postgres config enables durable **`clawql_ouroboros_events`**. |
| **Planned** vision               | `CLAWQL_ENABLE_VISION`                                                                                                                         | off                       | [#78](https://github.com/danielsmithdevelopment/ClawQL/issues/78) — reserved.                                                                                                                                                                                                                                                   |

---

## `ouroboros_*` (optional)

When **`CLAWQL_ENABLE_OUROBOROS=1`** (same truthy parsing as other **`CLAWQL_ENABLE_*`** flags), **`clawql-mcp`** registers the three tools defined in **`clawql-ouroboros/mcp-hooks`**: **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`**. Handlers return JSON as MCP **text** content. The server wires a default **Wonder / Reflect / Executor / Evaluator** (stubby, no external LLM) so the loop is runnable out of the box; replace with domain logic as needed.

**Persistence:** set **`CLAWQL_OUROBOROS_DATABASE_URL`** (or split **`CLAWQL_OUROBOROS_DB_HOST`**, **`CLAWQL_OUROBOROS_DB_PORT`**, **`CLAWQL_OUROBOROS_DB_USER`**, **`CLAWQL_OUROBOROS_DB_PASSWORD`**, **`CLAWQL_OUROBOROS_DB_NAME`**) to use Postgres for append + lineage rebuild (**`clawql_ouroboros_events`**). If unset, **`InMemoryEventStore`** is used (per-process only).

### Route hints for default executor (practical usage)

The default executor can route to real internal ClawQL operations without custom code when the input Seed carries a **route hint** inside **`brownfield_context.context_references`**.

Use one of these hint objects:

- **Execute path**
  - `{ "clawql_execute": { "operationId": "listPets", "args": { ... }, "fields": ["..."] } }`
- **Search path**
  - `{ "clawql_search": { "query": "find pet operations", "limit": 5 } }`

Why this shape: `SeedSchema` is strict for many fields; `context_references` is designed to carry arbitrary context objects safely, so hints survive schema validation and transport boundaries.

### End-to-end example (`ouroboros_run_evolutionary_loop`)

```json
{
  "seed": {
    "goal": "List pets through internal execute",
    "task_type": "analysis",
    "brownfield_context": {
      "project_type": "brownfield",
      "context_references": [
        {
          "clawql_execute": {
            "operationId": "listPets",
            "args": {},
            "fields": ["name"]
          }
        }
      ],
      "existing_patterns": [],
      "existing_dependencies": []
    },
    "constraints": [],
    "acceptance_criteria": ["Return non-empty output"],
    "ontology_schema": {
      "name": "PetOntology",
      "description": "Pet listing ontology",
      "fields": []
    },
    "evaluation_principles": [],
    "exit_conditions": [],
    "metadata": {
      "seed_id": "seed-demo-1",
      "version": "1.0.0",
      "created_at": "2026-01-01T00:00:00.000Z",
      "ambiguity_score": 0.1,
      "interview_id": null,
      "parent_seed_id": null
    }
  },
  "maxGenerations": 2,
  "convergenceThreshold": 0.8
}
```

Then call **`ouroboros_get_lineage_status`** with `seedId` equal to the loop response `lineageId`; generation records include `execution_output` with route metadata (for example `"route":"execute"`).

**Full library story (embed outside MCP, poller, Zod shapes):** **[`docs/clawql-ouroboros.md`](clawql-ouroboros.md)**. **Website:** [Ouroboros library](https://docs.clawql.com/ouroboros).

---

## `schedule` (optional)

**Env:** `CLAWQL_ENABLE_SCHEDULE=1` to register the tool. Optional envs: `CLAWQL_SCHEDULE_DB_PATH`, `CLAWQL_SCHEDULE_HISTORY_LIMIT`, `CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS`, `CLAWQL_SCHEDULE_INTERVAL_MAX_SECONDS`, `CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES`, and synthetic request caps under `CLAWQL_SCHEDULE_SYNTHETIC_*`.

The **`schedule`** tool supports persisted jobs (cron / interval / one-shot) with **typed actions**. In v1, `action.kind` is **`synthetic`** and includes `synthetic_test` (HTTP request + assertions) as described in **[schedule-synthetic-checks.md](schedule-synthetic-checks.md)**. Supported operations are `create`, `list`, `get`, `delete`, and `trigger`; `trigger` can run with `dry_run: true` to validate and execute assertions without persisting a run row. When `CLAWQL_ENABLE_SCHEDULE=1`, the server also starts a background worker that evaluates due jobs and executes them automatically on a poll interval (`CLAWQL_SCHEDULE_POLL_MS`, default 5000 ms). Failure notifications are intended to pair with **`notify`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); retrieval-heavy runbooks can pair with **`knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)) when **`CLAWQL_ENABLE_ONYX`** is set. ClawQL does not bundle third-party observability vendors; scheduled probes are defined and stored in a local SQLite schedule store.
