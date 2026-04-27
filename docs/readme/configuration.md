# ClawQL Configuration

This page summarizes how ClawQL selects specs, loads auth, and enables optional tools.

## Feature tiers (architecture diagram)

ClawQL groups capabilities into three bands. This matches the **layer diagram** (**ClawQL Core** vs default-on opt-out vs default-off opt-in):

### ClawQL Core (always on — no opt-out)

**There is no env or Helm toggle for Core.** The diagram places **`search`**, **`execute`**, **`audit`**, and **`cache`** in this band together:

- **`search`**, **`execute`** — OpenAPI / Discovery discovery and execution.
- **`audit`** — in-process event ring buffer ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)); tune **`CLAWQL_AUDIT_MAX_ENTRIES`** only. Not durable — use **`memory_ingest`** for persisted trails.
- **`cache`** — in-process LRU key/value ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)); tune **`CLAWQL_CACHE_MAX_*`** only. Not persisted — use **`memory_ingest`** / **`memory_recall`** for vault-backed state.

### Default on — opt out

Unset means **on**. Set **`0`**, **`false`**, or **`no`** to hide tools or shrink the default **`all-providers`** merge:

| Band                 | MCP tools                                                                                         | Env to opt out                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL Memory**    | **`memory_ingest`**, **`memory_recall`**                                                          | **`CLAWQL_ENABLE_MEMORY=0`**                                                                                                                                                                                                 |
| **ClawQL Documents** | **`ingest_external_knowledge`**; **`knowledge_search_onyx`** when also **`CLAWQL_ENABLE_ONYX=1`** | **`CLAWQL_ENABLE_DOCUMENTS=0`** (drops **tika**, **gotenberg**, **paperless**, **stirling**, **onyx** from the default merge; hides document MCP tools). Explicit **`CLAWQL_BUNDLED_PROVIDERS=…`** can still list those ids. |

### Default off — opt in

Set **`1`** / **`true`** / **`yes`** where noted:

| Band                  | MCP tools                       | Flags / prerequisites                                                                                                                                                  |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL Sandbox**    | **`sandbox_exec`**              | **Infrastructure-gated:** calls fail until **`CLAWQL_SANDBOX_BRIDGE_URL`** and token are set (Cloudflare Worker bridge). There is no separate `CLAWQL_ENABLE_SANDBOX`. |
| **ClawQL Ouroboros**  | **`ouroboros_*`** (three tools) | **`CLAWQL_ENABLE_OUROBOROS=1`**                                                                                                                                        |
| **ClawQL Automation** | **`schedule`**, **`notify`**    | **`CLAWQL_ENABLE_SCHEDULE=1`**, **`CLAWQL_ENABLE_NOTIFY=1`**                                                                                                           |

**`knowledge_search_onyx`** — **`CLAWQL_ENABLE_ONYX=1`** plus **Documents** still enabled (documents off hides the tool regardless).

### Diagram vs. this build

**Core** matches the diagram: **`search`**, **`execute`**, **`audit`**, **`cache`** — always on, **no opt-out** (no **`CLAWQL_ENABLE_*`** for Core).

## Spec Selection Precedence

ClawQL resolves specs in two stages:

1. Multi-spec merge mode
2. Single-spec mode

### Stage 1: Multi-spec merge (checked in order)

1. `CLAWQL_SPEC_PATHS`
2. `CLAWQL_BUNDLED_PROVIDERS`
3. `CLAWQL_PROVIDER` (merged preset such as `google`, `all-providers`, `atlassian`)
4. Built-in default merge (`all-providers`) when no single-spec env is set

When Stage 1 is active:

- `search` uses one merged operation index
- `execute` runs REST per owning spec

### Stage 2: Single-spec (first match wins)

1. `CLAWQL_SPEC_PATH`
2. `CLAWQL_SPEC_URL`
3. `CLAWQL_DISCOVERY_URL`
4. `CLAWQL_PROVIDER` (single vendor, e.g. `cloudflare`)

## High-Value Environment Variables

### Spec and provider selection

- `CLAWQL_SPEC_PATH`
- `CLAWQL_SPEC_PATHS`
- `CLAWQL_SPEC_URL`
- `CLAWQL_DISCOVERY_URL`
- `CLAWQL_PROVIDER`
- `CLAWQL_BUNDLED_PROVIDERS`

### Auth

- `CLAWQL_PROVIDER_AUTH_JSON` (preferred for merged providers)
- `CLAWQL_GITHUB_TOKEN`
- `CLAWQL_CLOUDFLARE_API_TOKEN`
- `CLAWQL_GOOGLE_ACCESS_TOKEN`
- `CLAWQL_BEARER_TOKEN` (scoped fallback)

### Vault memory

- `CLAWQL_OBSIDIAN_VAULT_PATH`
- `CLAWQL_MEMORY_RECALL_LIMIT`
- `CLAWQL_MEMORY_RECALL_MAX_DEPTH`
- `CLAWQL_MEMORY_RECALL_MIN_SCORE`
- `CLAWQL_MEMORY_DB`, `CLAWQL_MEMORY_DB_PATH`

### Optional tool flags

See **[Feature tiers](#feature-tiers-architecture-diagram)** first. Quick list:

- **Default on, opt out:** `CLAWQL_ENABLE_MEMORY`, `CLAWQL_ENABLE_DOCUMENTS` — set `0` / `false` / `no` to hide tools or trim default **`all-providers`** (documents).
- **Default off, opt in:** `CLAWQL_ENABLE_SCHEDULE`, `CLAWQL_ENABLE_NOTIFY`, `CLAWQL_ENABLE_ONYX`, `CLAWQL_ENABLE_OUROBOROS`.

## Full References

- Full MCP tool reference and env details: `docs/mcp-tools.md`
- Memory and vault details: `docs/memory-obsidian.md`
- Hybrid memory backends: `docs/hybrid-memory-backends.md`
- Provider matrix and bundled specs: `providers/README.md`
- Complete environment sample: `.env.example`
