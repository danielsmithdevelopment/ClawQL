# clawql-audit

Tamper-evident **WORM** (write-once) audit trail for AI agent deployments.

Hash-chained appends, dual-ack local+remote storage, Merkle batch roots, optional ECDSA TEE signatures, HTTP query API, and QR air-gap export — usable **without** the rest of ClawQL.

## Install

```bash
npm install clawql-audit
# peer: clawql-merkle is a normal dependency and installs automatically
```

Requires **Node.js ≥ 22**. Optional: `pg` for Postgres local backend.

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
  agentName: "my-agent",
});

console.log(await worm.verify()); // { valid: true }
await worm.stop();
```

## Capabilities

| Feature | Notes |
| --- | --- |
| Hash chain | `sealHashChainRecord` / `verify` |
| Dual-ack | Local + remote (SQLite / Postgres / memory + S3/R2) |
| Outbox | Drain on boot + background reconciler |
| Merkle batches | Periodic roots via `clawql-merkle` |
| TEE ECDSA | Optional P-256 `teeSignature` (`CLAWQL_WORM_TEE=1`) |
| HTTP API | ApiKey-auth REST when `httpPort` set |
| QR export | CBOR → RaptorQ → ChaCha20-Poly1305 → HMAC → QR |

## Storage

```typescript
import { SQLiteBackend, S3Backend, WORMAuditTrail } from "clawql-audit";

const worm = await WORMAuditTrail.create({
  local: new SQLiteBackend({ path: "./audit.db" }),
  remote: new S3Backend({ bucket: "agent-audit-trail" /* endpoint, credentials… */ }),
});
```

## Env (optional process host)

When embedding in a long-lived host, set `CLAWQL_WORM_ENABLED=1` and backend vars (`CLAWQL_WORM_LOCAL`, `CLAWQL_WORM_REMOTE`, `CLAWQL_WORM_TEE`, …). See package comments / ClawQL `.env.example` when using the full MCP host.

## Effect API

Prefer `makeWORMAuditTrailLayer` / `WORMAuditTrailService` inside Effect programs. The `WORMAuditTrail` class is a thin Promise façade for non-Effect hosts.

## Standalone guarantee

`clawql-audit` depends only on **`clawql-merkle`** among `clawql-*` packages (CI-enforced). It does **not** require `clawql-core`, MCP, or a vault.

## Not this package

Ephemeral MCP “audit” ring buffers (operator breadcrumbs) are a different surface.

## Hardware TEE

ECDSA signing ships today (`platform: simulated`). AMD SEV-SNP / Intel TDX remote attestation is a future **clawql-tee** integration on the same `TEESigner` interface.

## License

Apache-2.0
