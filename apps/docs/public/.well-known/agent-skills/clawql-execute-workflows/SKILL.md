---
name: clawql-execute-workflows
description: Execute discovered API operations safely with argument validation and post-change verification.
---

# ClawQL execute workflows

## When to apply

- You already have a valid `operationId`.
- You need real API action/output through MCP.

## Workflow

1. Confirm operation via `search`.
2. Build precise `args` from discovered params.
3. Optionally set `fields` to reduce payload.
4. Execute read-before-write when changing state.
5. Verify via follow-up read.

## Notes

- **OpenAPI/Discovery:** single-spec prefers OpenAPI→GraphQL with REST fallback; multi-spec uses REST per owning spec.
- **Native GraphQL/gRPC** (`CLAWQL_GRAPHQL_SOURCES` / `CLAWQL_GRPC_SOURCES`): `execute` uses HTTP GraphQL or gRPC unary — same `operationId` contract, different transport (see ADR 0002).
