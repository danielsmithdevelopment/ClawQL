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

- Single-spec path: GraphQL-first with REST fallback.
- Multi-spec path: REST-only.
