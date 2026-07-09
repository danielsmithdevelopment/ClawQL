# Custom sources (add from URL)

ClawQL matches Executor-style **add any integration from a URL**, plus **MCP** and **CLI** source types. Custom entries live in **`~/.ClawQL/sources.json`** and are merged into MCP **`search`** / **`execute`** on server startup (alongside bundled OpenAPI, Discovery, GraphQL, and gRPC).

## CLI

```bash
# Auto-detect OpenAPI, Discovery, GraphQL, gRPC proto, or MCP HTTP
clawql sources add https://example.com/openapi.json --name "Example API"

# MCP HTTP endpoint
clawql sources add https://remote.example/mcp --kind mcp

# CLI wrapper (subprocess)
clawql sources add --kind cli --command mytool --args "--json" --name "My CLI"

clawql sources list
clawql sources remove example-api
```

Restart **`clawql-mcp`** (or your MCP client) after adding or removing sources.

## Desktop / dashboard

In **ClawQL Desktop** mode, the dashboard exposes **`GET/POST/DELETE /api/local/sources`** (same JSON shape as `sources.json`).

## Harness wrappers

Pre-wire ClawQL MCP and launch the agent binary:

```bash
clawql claude -- "fix the failing test"
clawql cursor
clawql codex
clawql opencode
```

## Install

```bash
curl -fsSL https://clawql.com/install | bash
```

Requires Node.js 22+.

## vs bundled providers

| Kind | How it loads |
|------|----------------|
| OpenAPI / Discovery | Cached spec under `~/.ClawQL/sources/<id>/` |
| GraphQL | SDL or introspection file + `graphqlEndpoint` |
| gRPC | `.proto` on disk + `grpcEndpoint` |
| MCP | Proxies `tools/list` from remote MCP server |
| CLI | One `execute` op runs configured command + args |

ClawQL still wins on **search + execute** with **GraphQL projection** for OpenAPI-backed APIs; custom sources extend the same index.
