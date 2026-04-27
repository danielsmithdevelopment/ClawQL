# ClawQL

ClawQL is an MCP server for API discovery and execution with a token-efficient `search -> execute` workflow over OpenAPI and Google Discovery specs.

## What You Get

Feature tiers (aligned with the [architecture diagram](docs/readme/images/clawql-feature-tiers.png) — details in [`docs/readme/configuration.md`](docs/readme/configuration.md#feature-tiers-architecture-diagram)):

- **ClawQL Core (always on — no opt-out):** `search`, `execute`, `audit`, `cache` — same band in the diagram; ring-buffer semantics for `audit` and LRU semantics for `cache` in [`docs/enterprise-mcp-tools.md`](docs/enterprise-mcp-tools.md) and [`docs/cache-tool.md`](docs/cache-tool.md).
- **Default on — opt out:** `memory_ingest` / `memory_recall`, and the **document** stack (`ingest_external_knowledge`, plus `knowledge_search_onyx` when `CLAWQL_ENABLE_ONYX=1`). Use `CLAWQL_ENABLE_MEMORY=0` or `CLAWQL_ENABLE_DOCUMENTS=0` to hide; vault path still required for real disk I/O on memory / ingest.
- **Default off — opt in:** `schedule`, `notify`, `knowledge_search_onyx` (needs `CLAWQL_ENABLE_ONYX=1` and documents on), `ouroboros_*` — see `docs/mcp-tools.md`. **`sandbox_exec`** is always registered; it only runs code when **`CLAWQL_SANDBOX_BRIDGE_URL`** (and token) are set.
- Stdio and HTTP MCP server modes
- Bundled provider specs for offline lookup and multi-provider workflows

Primary package: `clawql-mcp`  
Repo: https://github.com/danielsmithdevelopment/ClawQL

## Quick Start

Install:

```bash
npm install clawql-mcp
```

Run with bundled providers:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

Then configure your MCP client (Cursor/Claude Desktop) to connect.

## Documentation Map

Top-level docs index: `docs/README.md`

### Start here

- Getting started: `docs/readme/getting-started.md`
- Configuration and env precedence: `docs/readme/configuration.md`
- Deployment and client config: `docs/readme/deployment.md`
- Benchmarks and case studies: `docs/readme/benchmarks.md`
- Development notes: `docs/readme/development.md`
- Tool workflow skills: `docs/skills/README.md`

### Core references

- MCP tools and examples: `docs/mcp-tools.md`
- Workflow recipes: `docs/recipes/README.md`
- Memory and vault workflows: `docs/memory-obsidian.md`
- Cache tool: `docs/cache-tool.md`
- Enterprise MCP notes (`audit` threat model, future metrics/governance): `docs/enterprise-mcp-tools.md`
- Slack notify tool: `docs/notify-tool.md`
- Onyx knowledge tool: `docs/onyx-knowledge-tool.md`
- Ouroboros package and integration: `docs/clawql-ouroboros.md`

### Deployments

- Docker: `docker/README.md`
- Cloud Run: `docs/deployment/deploy-cloud-run.md`
- Kubernetes: `docs/deployment/deploy-k8s.md`
- Helm chart: `docs/deployment/helm.md`

### Providers and specs

- Provider matrix and presets: `providers/README.md`
- Google Discovery helpers: `docs/providers/google-apis-lookup.md`

## Architecture (Short Version)

1. Agent calls `search` to discover relevant operations without loading entire specs into prompt context.
2. Agent calls `execute` with operation details.
3. In single-spec mode, ClawQL can use an internal OpenAPI-to-GraphQL path to keep responses lean.
4. In multi-spec mode, ClawQL executes via REST per owning spec.

## Notes

- **Core** (`search`, `execute`, `audit`, `cache`) has **no opt-out** — no **`CLAWQL_ENABLE_*`** gate for those tools.
- A writable `CLAWQL_OBSIDIAN_VAULT_PATH` is required to read/write the vault for **`memory_*`** and bulk **`ingest_external_knowledge`**.
- For full environment variable details, see `.env.example` and `docs/mcp-tools.md`.
