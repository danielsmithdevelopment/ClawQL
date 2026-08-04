# Changelog

## 0.3.0

- **Any MCP upstream:** connect via Streamable HTTP (`--mcp-url`), stdio (`--stdio -- <cmd…>`), or gRPC (`--grpc-address`).
- **Triple-surface scaffold:** OpenAPI + GraphQL always; gRPC reused (gRPC upstream) or **locally scaffolded** via `mcp-grpc-transport` (stdio/HTTP).
- New entrypoint `startMcpGateway({ upstream, grpcListen })`; `startMcpOpenApiGateway` kept as gRPC-only compat wrapper.
- Catalog exposes `upstream`, `upstreamKind`, and `surfaces`.
- User guide: `docs/mcp/mcp-openapi-gateway.md`.

## 0.2.0

- GraphQL on-ramp: `POST /graphql`, GraphiQL at `/graphiql`, SDL at `/graphql/schema.graphql`.
- Per-tool mutations (flattened JSON Schema args) plus generic `callTool(name, args)`.
- Same gRPC `CallTool` backend as OpenAPI REST.

## 0.1.0

- Initial release: OpenAPI on-ramp over `mcp-grpc-transport` (`ListTools` → `POST /{toolName}` → `CallTool`).
- Serves `/openapi.json`, `/docs` (Swagger UI), `/tools`, `/healthz`.
- Injects `x-clawql-grpc` OpenAPI extensions pointing at the gRPC production path.
