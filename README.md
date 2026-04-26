# ClawQL

ClawQL is an MCP server for API discovery and execution with a token-efficient `search -> execute` workflow over OpenAPI and Google Discovery specs.

## What You Get

- Core MCP tools: `search`, `execute`
- Optional tools (env-gated): `sandbox_exec`, `memory_ingest`, `memory_recall`, `ingest_external_knowledge`, `cache`, `audit`, `notify`, `knowledge_search_onyx`, `schedule`, `ouroboros_*`
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
- Enterprise optional tools (`audit`, etc.): `docs/enterprise-mcp-tools.md`
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

- Optional tools are disabled by default and activated via `CLAWQL_ENABLE_*` flags.
- Vault memory tools require `CLAWQL_OBSIDIAN_VAULT_PATH`.
- For full environment variable details, see `.env.example` and `docs/mcp-tools.md`.
