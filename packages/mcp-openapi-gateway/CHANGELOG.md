# Changelog

## 0.1.0

- Initial release: OpenAPI on-ramp over `mcp-grpc-transport` (`ListTools` → `POST /{toolName}` → `CallTool`).
- Serves `/openapi.json`, `/docs` (Swagger UI), `/tools`, `/healthz`.
- Injects `x-clawql-grpc` OpenAPI extensions pointing at the gRPC production path.
