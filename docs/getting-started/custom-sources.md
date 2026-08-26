# Custom sources — register MCP servers (and APIs) into one gateway

**Canonical docs URL:** [docs.clawql.com/getting-started/custom-sources](https://docs.clawql.com/getting-started/custom-sources)

ClawQL is an **MCP gateway**: one agent-facing MCP surface that **registers other MCP servers** (and OpenAPI / Discovery / GraphQL / gRPC / CLI backends) into a single searchable, executable index. You permit and lock down that one surface — with Panguard/ATR policy, sandbox backends such as **macOS Seatbelt**, audit, and env gates — instead of giving every agent raw access to a growing pile of point MCP servers.

```text
  Cursor / Claude / OpenClaw / …
              │
              ▼
        clawql-mcp   ← single MCP endpoint the agent talks to
              │
    ┌─────────┼──────────┬──────────┬─────────┐
    ▼         ▼          ▼          ▼         ▼
  Bundled   MCP A     MCP B     OpenAPI    CLI …
  providers (remote)  (stdio)   APIs
```

Custom entries live in **`~/.ClawQL/sources.json`** and are merged into gateway **`search`** / **`execute`** on server startup.

## Why this exists

Generic MCP servers are point integrations — one tool set, one backend, one trust boundary each. ClawQL consolidates them:

| Without ClawQL                         | With ClawQL custom sources                                              |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Agent config lists many MCP servers    | Agent connects to **one** ClawQL MCP                                    |
| Policy/allowlists per server (or none) | Permit and deny at the **gateway** (Panguard, ATR, sandbox)             |
| No shared search / audit               | **`search`** ranks ops; **`execute`** validates; **audit** trails calls |
| Seatbelt / sandbox per process         | One gateway process under Seatbelt / sandbox; tools fan out behind it   |

Related lockdown surfaces:

- [Local agent sandbox (macOS Seatbelt)](/agent-setup#local-agent-sandbox-mac-os-seatbelt)
- [Sandbox plugin](/plugins/sandbox) — `sandbox_exec` when `CLAWQL_ENABLE_SANDBOX=1`
- [MCP proxy / JWT ATR](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/mcp-proxy-jwt-atr.md)
- [Panguard proxy plugin](/plugins/panguard-proxy)

## Register another MCP server

```bash
# Streamable HTTP MCP endpoint
clawql sources add https://remote.example/mcp --kind mcp --name "Other MCP"

# WebMCP page source (Chrome preview + CDP required)
clawql sources add https://docs.clawql.com --kind webmcp --name "ClawQL Docs"

# Auto-detect OpenAPI, Discovery, GraphQL, gRPC proto, or MCP HTTP
clawql sources add https://example.com/openapi.json --name "Example API"

# CLI wrapper (subprocess) as a source
clawql sources add --kind cli --command mytool --args "--json" --name "My CLI"

clawql sources list
clawql sources remove other-mcp
```

**Restart `clawql-mcp`** (or reconnect your MCP client) after adding or removing sources.

What happens on startup for `kind: mcp`:

1. ClawQL connects as an MCP client (`mcpUrl` Streamable HTTP, or `mcpCommand` / `mcpArgs` stdio).
2. It calls **`tools/list`** and indexes each tool as a searchable/executable operation (`mcp/<sourceId>/<toolName>`).
3. Agents use gateway **`search`** then **`execute`** — ClawQL proxies **`tools/call`** to the upstream server.

Stdio MCP packages can be registered by editing `~/.ClawQL/sources.json` with `mcpCommand` / `mcpArgs` / optional `mcpEnv` (same shape as the types in `clawql-api`). Prefer HTTP when the upstream already exposes Streamable HTTP.

### WebMCP page sources (preview)

WebMCP is the **inverse** of `/mcp-ui`: websites register tools in the browser via [`navigator.modelContext`](https://webmachinelearning.github.io/webmcp/); ClawQL Core **ingests** those tools as searchable/executable operations (left side of Protocol Fabric).

Requirements:

1. **Chromium with WebMCP** (Chrome preview flag) listening on CDP — default `http://127.0.0.1:9222`, override with `CLAWQL_WEBMCP_CDP_URL` or per-source `webmcpCdpUrl`.
2. **HTTPS page** that registers tools (e.g. [docs.clawql.com](https://docs.clawql.com) via `WebMcpRegister`).
3. `clawql sources add https://docs.clawql.com --kind webmcp --name "ClawQL Docs"`

On startup ClawQL opens the page in CDP, calls `document.modelContext.getTools()`, indexes each tool (`webmcp/<sourceId>/<toolName>`), and proxies `execute` back via `executeTool()`.

## Desktop / dashboard

In **ClawQL Desktop** mode, the dashboard exposes **`GET/POST/DELETE /api/local/sources`** (same JSON shape as `sources.json`).

## Source kinds

| Kind                | How it loads                                                   |
| ------------------- | -------------------------------------------------------------- |
| OpenAPI / Discovery | Cached spec under `~/.ClawQL/sources/<id>/`                    |
| GraphQL             | SDL or introspection file + `graphqlEndpoint`                  |
| gRPC                | `.proto` on disk + `grpcEndpoint`                              |
| **MCP**             | Proxies `tools/list` / `tools/call` from the remote MCP server |
| **WebMCP**          | Discovers page tools via `navigator.modelContext` over CDP (Chrome preview) |
| CLI                 | One `execute` op runs configured command + args                |

Bundled providers and custom sources share the same **`search` / `execute`** index. Custom sources extend that index; they do not require a second MCP client entry in Cursor/Claude.

## Harness wrappers

Pre-wire ClawQL MCP and launch the agent binary (agent still sees **one** gateway):

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

## See also

- [Quickstart](/quickstart) — first MCP connection
- [Agent setup](/agent-setup) — client config + Seatbelt sandbox
- [MCP clients](/mcp-clients) — Cursor, Claude, OpenClaw, …
- [Plugins](/plugins) — horizontal tools composed on the same gateway
- [mcp-api-adapter](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-api-adapter.md) — inverse path (MCP → OpenAPI for non-MCP clients)
