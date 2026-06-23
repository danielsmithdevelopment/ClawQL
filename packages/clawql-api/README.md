# clawql-api

Composition root for ClawQL ([#308](https://github.com/danielsmithdevelopment/ClawQL/issues/308)): plugin registry, `search` / `execute` Effect entrypoints, provider registry, Panguard proxy plugin.

MCP transport (`clawql-mcp`) delegates `search` and `execute` via `getClawqlApi().run(Effect…)` in `src/clawql-api-adapters.ts`. See [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).
