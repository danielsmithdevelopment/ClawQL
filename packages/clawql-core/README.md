# clawql-core

Effect-TS foundation for ClawQL modularization ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). Ground truth: [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).

**Shipped:** `AuditService` + in-process **hash-chained** audit ring buffer (MCP `audit` tool delegates here; `verify` for the retained window); Merkle tree + Cuckoo modules; hash-chain helpers; `Plugin` types and shared errors; cache helpers.

**Integrity primitives:** Merkle trees and hash-chain seal/verify live in **`clawql-merkle`**. This package re-exports them so existing `clawql-core` imports keep working.

**Loki:** `loki/` Effect helper (`LokiLogPush`) POSTs JSON log lines to Grafana Loki. MCP `audit.append` uses stream **`job=clawql-audit`**; clawql-inference call-store appends use **`job=clawql-inference`**.

**Internal modules:**

- `merkle/` / `hash-chain/` — re-exports from `clawql-merkle`
- `cuckoo/` — ingest deduplication filters
- `loki/` — Grafana Loki JSON-line push (`LokiLogPush`)
