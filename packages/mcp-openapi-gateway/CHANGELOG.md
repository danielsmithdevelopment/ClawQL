# Changelog

## 0.2.0

- GraphQL on-ramp: `POST /graphql`, GraphiQL at `/graphiql`, SDL at `/graphql/schema.graphql`.
- Per-tool mutations (flattened JSON Schema args) plus generic `callTool(name, args)`.
- Same gRPC `CallTool` backend as OpenAPI REST.

## 0.1.0

- Initial release: OpenAPI on-ramp over `mcp-grpc-transport` (`ListTools` → `POST /{toolName}` → `CallTool`).
- Serves `/openapi.json`, `/docs` (Swagger UI), `/tools`, `/healthz`.
- Injects `x-clawql-grpc` OpenAPI extensions pointing at the gRPC production path.
