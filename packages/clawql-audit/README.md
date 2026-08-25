# clawql-audit

Tamper-evident **WORM** audit trail for AI agent deployments. Standalone — no dependency on `clawql-core`, `clawql-memory`, or other ClawQL packages (only `clawql-merkle` + Effect + AWS SDK / CBOR / QR / RaptorQ; optional `pg`).

## Capabilities

- Hash-chained append (`sealHashChainRecord`)
- Dual-ack local + remote (SQLite/`node:sqlite`, Postgres, or memory + S3/R2)
- Outbox drain on startup + optional background reconciler
- Periodic Merkle batch roots (handoff for multi-chain anchoring)
- Query, verify, JSON/CSV/QR export
- Optional HTTP REST API (`Authorization: ApiKey …`)

## Quick start

```typescript
import { WORMAuditTrail, MemoryBackend } from "clawql-audit";

const worm = await WORMAuditTrail.create({
  local: new MemoryBackend(),
  remote: new MemoryBackend(),
});

await worm.append({
  type: "SESSION_START",
  timestamp: new Date().toISOString(),
  sessionId: "sess_demo",
  agentName: "langchain-sql-agent",
});

console.log(await worm.verify()); // { valid: true }
await worm.stop();
```

## HTTP

```typescript
const worm = await WORMAuditTrail.create({
  local: new SQLiteBackend({ path: "./audit.db" }),
  remote: new S3Backend({ bucket: "agent-audit-trail", /* … */ }),
  httpPort: 8787,
  apiKey: process.env.CLAWQL_AUDIT_API_KEY!,
});
```

Routes: `POST/GET /entries`, `GET /entries/:id`, `GET /chain/verify`, `GET /chain/latest`, `POST /export/qr` (keys from env only).

## QR air-gap export

Set `CLAWQL_AUDIT_QR_ENCRYPTION_KEY` and `CLAWQL_AUDIT_QR_HMAC_KEY` (32-byte hex each). Pipeline: CBOR → RaptorQ → ChaCha20-Poly1305 → HMAC-SHA256 → QR ECC M.

## Effect API

Prefer `makeWORMAuditTrailLayer` / `WORMAuditTrailService` inside ClawQL. The `WORMAuditTrail` class is a thin host façade.

## Not this package

The MCP `audit` tool ring buffer is ephemeral operator breadcrumbs — a different product surface.

## Phase 3 (not yet)

Real TEE ECDSA signer/verifier (`clawql-tee` integration).
