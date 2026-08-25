# Changelog

## Unreleased

- **`/mcp-ui` surface (v0):** HTMX playground auto-generated from the tool catalog — `GET /mcp-ui`, `POST /mcp-ui/execute/{toolName}`. Flat forms for string/number/boolean/enum; JSON textarea fallback for complex schemas. `--mcp-ui-path`, `--no-mcp-ui`.

## 0.6.0

- **WebSocket surface** (`/ws`): JSON tool-call messages over a persistent connection (sixth surface). `--ws-path`, `--no-ws`.
- Protocol Fabric loop smoke: `scripts/dev/smoke-protocol-fabric-loop.sh` (gen-cli → CLI custom source → MCP → adapter → `memory_ingest`).

## 0.5.1

- Fix Streamable HTTP `/mcp` when upstream is **gRPC**: normalize protobuf CallTool content oneofs into MCP `{ type: "text", text }` blocks (SDK validation was rejecting raw wire shapes).

## 0.5.0

- **Streamable HTTP `/mcp`:** re-export the same tools as MCP for IDE/agent clients (`--mcp-path`, `--no-mcp`).
- **`gen-cli`:** generate a thin Node CLI from the tool catalog (`mcp-api-adapter gen-cli --out <dir> …`). PrintingPress is the planned upgrade path for signed binaries.

## 0.4.0

- **Rename:** package `mcp-openapi-gateway` → **`mcp-api-adapter`**.
- Primary API: `startMcpApiAdapter({ upstream, … })` / CLI `mcp-api-adapter`.
- Deprecated aliases retained: `startMcpGateway`, `startMcpOpenApiGateway`, env `MCP_OPENAPI_GATEWAY_*`.

## 0.3.0

- **Any MCP upstream:** Streamable HTTP (`--mcp-url`), stdio (`--stdio -- <cmd…>`), or gRPC (`--grpc-address`).
- **Triple API scaffold:** OpenAPI + GraphQL; gRPC reused or locally scaffolded.
- User guide: `docs/mcp/mcp-api-adapter.md`.

## 0.2.0

- GraphQL on-ramp: `POST /graphql`, GraphiQL, SDL, per-tool mutations + `callTool`.

## 0.1.0

- Initial release (as `mcp-openapi-gateway`): OpenAPI on-ramp over `mcp-grpc-transport`.
