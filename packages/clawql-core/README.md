# clawql-core

Effect-TS foundation for ClawQL modularization ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307), plan in [`docs/design/effect-ts-modularization-rearchitecture-plan.md`](../../docs/design/effect-ts-modularization-rearchitecture-plan.md)).

**Phase 0:** `AuditService` + in-process audit ring buffer (MCP `audit` tool delegates here).

**Planned modules (inside this package, not separate npm workspaces):**

- `merkle/` — tamper-evident roots
- `cuckoo/` — ingest deduplication filters
- `utils/` — shared primitives
