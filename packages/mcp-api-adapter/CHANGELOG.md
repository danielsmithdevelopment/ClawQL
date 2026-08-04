# Changelog

## 0.4.0

- **Rename:** package `mcp-openapi-gateway` → **`mcp-api-adapter`** (standalone MCP → API adapter; avoids confusion with ClawQL’s Agentic Gateway).
- Primary API: `startMcpApiAdapter({ upstream, … })` / CLI `mcp-api-adapter`.
- Deprecated aliases retained: `startMcpGateway`, `startMcpOpenApiGateway`, env `MCP_OPENAPI_GATEWAY_*`.

## 0.3.0

- **Any MCP upstream:** connect via Streamable HTTP (`--mcp-url`), stdio (`--stdio -- <cmd…>`), or gRPC (`--grpc-address`).
- **Triple API scaffold:** OpenAPI + GraphQL always; gRPC reused (gRPC upstream) or **locally scaffolded** via `mcp-grpc-transport` (stdio/HTTP).
- Catalog exposes `upstream`, `upstreamKind`, and `surfaces`.
- User guide: `docs/mcp/mcp-api-adapter.md`.

## 0.2.0

- GraphQL on-ramp: `POST /graphql`, GraphiQL at `/graphiql`, SDL at `/graphql/schema.graphql`.
- Per-tool mutations (flattened JSON Schema args) plus generic `callTool(name, args)`.
- Same gRPC `CallTool` backend as OpenAPI REST.

## 0.1.0

- Initial release (as `mcp-openapi-gateway`): OpenAPI on-ramp over `mcp-grpc-transport`.
