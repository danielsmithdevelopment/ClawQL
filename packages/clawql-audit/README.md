# clawql-audit

Tamper-evident WORM audit trail. Hash-chain + Merkle batch roots via `clawql-merkle`. Dual-ack local/remote with an outbox (`remote_queued` is not RPO=0).

Phase 1 in this repo: Effect `WORMAuditTrail` + in-memory or **sql.js SQLite** dual-ack. S3/HTTP/QR/TEE are specified in [`docs/audit/clawql-audit-spec-v0.1.md`](../../docs/audit/clawql-audit-spec-v0.1.md).

Does **not** depend on `clawql-core`. MCP `audit` remains the ephemeral ring in core.
