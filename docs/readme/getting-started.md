# ClawQL Getting Started

This guide is the quick path for running `clawql-mcp` locally and connecting it to an MCP client.

## First 5 Minutes

1. Install:

```bash
npm install clawql-mcp
```

2. Run with bundled providers:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

3. Point your MCP client (Cursor/Claude Desktop) at `clawql-mcp` over stdio.

## TL;DR Run Modes

### Bundled specs (default recommended)

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

### Local OpenAPI file

```bash
CLAWQL_SPEC_PATH=./openapi.yaml npx clawql-mcp
```

### Remote OpenAPI URL

```bash
CLAWQL_SPEC_URL=https://example.com/openapi.json npx clawql-mcp
```

### Google Discovery URL

```bash
CLAWQL_DISCOVERY_URL="https://compute.googleapis.com/$discovery/rest?version=v1" npx clawql-mcp
```

## Install Notes

- Package size is intentionally larger than average because bundled provider specs ship with the package for offline lookup.
- Primary binaries:
  - `clawql-mcp` (stdio MCP server)
  - `clawql-mcp-http` (HTTP MCP server with `/mcp`, `/healthz`, `/graphql`)

## Core Tools

- `search`
- `execute`

Optional tools are enabled by environment flags (memory, sandbox, cache, audit, notify, Onyx, schedule, Ouroboros).

**Native APIs:** set **`CLAWQL_GRAPHQL_SOURCES`** and/or **`CLAWQL_GRPC_SOURCES`** (JSON arrays) to merge GraphQL HTTP endpoints and gRPC unary RPCs into the same **`search`** / **`execute`** index as OpenAPI — see **`docs/readme/configuration.md`** and **`docs/mcp-tools.md`**.

See `docs/mcp-tools.md` for the complete tool catalog and examples.

## Next Steps

- Spec selection and precedence: `docs/readme/configuration.md`
- Cursor / Claude config examples: `docs/readme/deployment.md`
- Cloud Run / Kubernetes deployment: `docs/readme/deployment.md`
