# `panguard-mcp-bridge`

**Streamable HTTP MCP** gateway that keeps **[`@panguard-ai/panguard-mcp-proxy`](https://www.npmjs.com/package/@panguard-ai/panguard-mcp-proxy)** on the **stdio** path while forwarding to remote **`clawql-mcp-http`**.

## Topology

```text
Client / Istio  ──HTTP /mcp──►  gateway-main  ──stdio──►  panguard-mcp-proxy  ──stdio──►  shim-main  ──HTTP──►  clawql-mcp-http/mcp
```

## Binaries

| Command | Role |
| ------- | ---- |
| **`clawql-panguard-bridge-gateway`** | Express + Streamable HTTP MCP (default **:8080**) |
| **`clawql-panguard-bridge-shim`** | stdio MCP server → `StreamableHTTPClientTransport` upstream |

## Env (gateway)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| **`PORT`** / **`MCP_PORT`** | `8080` | HTTP listen |
| **`MCP_PATH`** | `/mcp` | MCP route |
| **`CLAWQL_BRIDGE_UPSTREAM_URL`** | built from host/port | Full URL to ClawQL MCP (`http://clawql-mcp-http:8080/mcp`) |
| **`CLAWQL_BRIDGE_UPSTREAM_HOST`** | `clawql-mcp-http` | Host if URL not set |
| **`CLAWQL_BRIDGE_UPSTREAM_PORT`** | `8080` | Port if URL not set |
| **`CLAWQL_BRIDGE_STREAMABLE_HTTP_JSON_RESPONSE`** | `0` | Set `1` / `true` for JSON MCP responses (Cursor-friendly) |
| **`CLAWQL_BRIDGE_SHIM_PATH`** | next to `gateway-main.js` | Absolute path to **`shim-main.js`** inside the container/image |
| **`CLAWQL_BRIDGE_PANGUARD_COMMAND`** | `npx` | Executable used to launch Panguard (image installs **`@panguard-ai/panguard-mcp-proxy`** globally; **`npx`** is enough) |

Spawn shape (fixed args after command):  
`<CLAWQL_BRIDGE_PANGUARD_COMMAND> -y @panguard-ai/panguard-mcp-proxy -- <node> <shim-path>`.

## Env (shim)

| Variable | Default |
| -------- | ------- |
| **`CLAWQL_BRIDGE_UPSTREAM_URL`** | `http://127.0.0.1:8080/mcp` (or host/port/path below) |
| **`CLAWQL_BRIDGE_UPSTREAM_HOST`** | `127.0.0.1` |
| **`CLAWQL_BRIDGE_UPSTREAM_PORT`** | `8080` |
| **`CLAWQL_BRIDGE_UPSTREAM_MCP_PATH`** | `/mcp` |

## Docker

From repo root:

```bash
docker build -f docker/panguard-mcp-bridge/Dockerfile -t clawql-panguard-mcp-bridge:local .
```

## gRPC

Set **`ENABLE_GRPC=1`** (and optional **`ENABLE_GRPC_REFLECTION`**, **`GRPC_PORT`**, **`GRPC_BIND`**) to listen with **`mcp-grpc-transport`**. Each **`mcp.transport.v1.Mcp` Session** stream spawns the same Panguard → shim chain as HTTP **initialize**. Unary protobuf **`model_context_protocol.Mcp`** uses an empty shared server—prefer **Session** or **HTTP** for delegated tools. See [`docs/integrations/panguard-http-grpc-bridge.md`](../../docs/integrations/panguard-http-grpc-bridge.md).

## Helm

Set **`mcpProxy.mode: custom`** with an image built from **`docker/panguard-mcp-bridge/Dockerfile`**. The image **`CMD`** runs **`node /app/packages/panguard-mcp-bridge/dist/gateway-main.js`**; override only if you relocate artifacts.
