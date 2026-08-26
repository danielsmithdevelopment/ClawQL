# clawql-audit

Tamper-evident WORM audit trail. Hash-chain + Merkle batch roots via [`clawql-merkle`](../clawql-merkle). Dual-ack local/remote with an outbox (`remote_queued` is not RPO=0).

## Features (7.2.0)

- Effect `WORMAuditTrail` Tag + Layer (`createWORMAuditTrail` host façade)
- In-memory or **sql.js** SQLite dual-ack backends
- Optional **ECDSA P-256 TEE** signatures (`createSimulatedTeeSigner` / `tee` on trail config)
- Process WORM (`CLAWQL_WORM_ENABLED=1`) + domain sinks (auth, inference, tools, …)

Does **not** depend on `clawql-core`. MCP `audit` remains the ephemeral ring in core.

Standalone install / publish notes: [`docs/security/clawql-audit-standalone.md`](../../docs/security/clawql-audit-standalone.md).
