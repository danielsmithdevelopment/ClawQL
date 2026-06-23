# clawql-core

Effect-TS foundation for ClawQL modularization ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). Ground truth: [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).

**Shipped:** `AuditService` + in-process audit ring buffer (MCP `audit` tool delegates here); Merkle + Cuckoo modules; `Plugin` types and shared errors; cache helpers.

**Internal modules (inside this package, not separate npm workspaces):**

- `merkle/` — tamper-evident roots
- `cuckoo/` — ingest deduplication filters
