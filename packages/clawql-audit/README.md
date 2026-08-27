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
  remote: new S3Backend({ bucket: "agent-audit-trail" /* … */ }),
  httpPort: 8787,
  apiKey: process.env.CLAWQL_AUDIT_API_KEY!,
});
```

Routes: `POST/GET /entries`, `GET /entries/:id`, `GET /chain/verify`, `GET /chain/latest`, `POST /export/qr` (keys from env only).

## QR air-gap export

Set `CLAWQL_AUDIT_QR_ENCRYPTION_KEY` and `CLAWQL_AUDIT_QR_HMAC_KEY` (32-byte hex each). Pipeline: CBOR → RaptorQ → ChaCha20-Poly1305 → HMAC-SHA256 → QR ECC M.

## Env (process host)

Set `CLAWQL_WORM_ENABLED=1` to boot a process-scoped trail. Callers dual-write via `appendProcessWormEffect` / sink helpers:

| Variable                                     | Role                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `CLAWQL_WORM_LOCAL`                          | `memory` \| `sqlite` \| `postgres`                                      |
| `CLAWQL_WORM_SQLITE_PATH`                    | SQLite file (implies local=sqlite when unset)                           |
| `CLAWQL_WORM_POSTGRES_URL`                   | Postgres DSN                                                            |
| `CLAWQL_WORM_REMOTE`                         | `memory` \| `s3`                                                        |
| `CLAWQL_WORM_S3_BUCKET` / `_ENDPOINT` / `_…` | S3/R2 remote                                                            |
| `CLAWQL_WORM_SESSION_ID`                     | Default `sessionId` on append                                           |
| `CLAWQL_WORM_RECONCILE_MS`                   | Outbox drain interval (`0` disables)                                    |
| `CLAWQL_WORM_TEE`                            | `1` = ECDSA P-256 `teeSignature` on append                              |
| `CLAWQL_WORM_TEE_PLATFORM`                   | `simulated` (default); `sev-snp`/`tdx` need clawql-tee hardware adapter |
| `CLAWQL_WORM_TEE_PRIVATE_KEY_PEM` / `_PATH`  | Optional PEM pair; ephemeral if omitted (simulated only)                |
| `CLAWQL_WORM_TEE_PUBLIC_KEY_PEM` / `_PATH`   | Public half of TEE signing key                                          |

Host boots via `bootProcessWormFromEnv` / `ensureProcessWormHostBooted` (MCP). Auth injects `createAuthEventWormSink()`; memory uses `createMemoryWormSink()` + `registerMemoryWormSink`.

## Effect API

Prefer `makeWORMAuditTrailLayer` / `WORMAuditTrailService` inside ClawQL. The `WORMAuditTrail` class is a thin host façade.

## Phase 3 TEE (simulated)

ECDSA P-256 signatures over entry content hashes (`teeSignature`, excluded from hash body). Software simulated keys ship in-package; verify with `verifyTEESignature`. Hardware attestation (SEV-SNP / TDX) is a `clawql-tee` follow-up.

```typescript
import { WORMAuditTrail, MemoryBackend, createSimulatedTeeSigner } from "clawql-audit";
import { Effect } from "effect";

const tee = await Effect.runPromise(createSimulatedTeeSigner());
const worm = await WORMAuditTrail.create({
  local: new MemoryBackend(),
  remote: new MemoryBackend(),
  tee,
});
```

## Not this package

The MCP `audit` tool ring buffer is ephemeral operator breadcrumbs — a different product surface.
