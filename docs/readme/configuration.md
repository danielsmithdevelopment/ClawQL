# ClawQL Configuration

This page summarizes how ClawQL selects specs, loads auth, and enables optional tools.

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

- `CLAWQL_ENABLE_CACHE`
- `CLAWQL_ENABLE_AUDIT`
- `CLAWQL_ENABLE_NOTIFY`
- `CLAWQL_ENABLE_ONYX`
- `CLAWQL_ENABLE_SCHEDULE`
- `CLAWQL_ENABLE_OUROBOROS`

## Full References

- Full MCP tool reference and env details: `docs/mcp-tools.md`
- Memory and vault details: `docs/memory-obsidian.md`
- Hybrid memory backends: `docs/hybrid-memory-backends.md`
- Provider matrix and bundled specs: `providers/README.md`
- Complete environment sample: `.env.example`
