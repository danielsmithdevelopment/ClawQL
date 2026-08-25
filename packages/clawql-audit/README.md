# clawql-audit

Tamper-evident **WORM** audit trail for AI agent deployments. Standalone — no dependency on `clawql-core`, `clawql-memory`, or other ClawQL packages (only `clawql-merkle` + Effect + optional AWS SDK).

## Phase 1 (this release)

- Hash-chained append (`sealHashChainRecord`)
- Dual-ack local + remote (SQLite/`node:sqlite` or memory + S3/R2 or memory)
- Outbox drain on startup
- Merkle batch roots / inclusion proofs via `clawql-merkle`
- Query, verify, JSON/CSV export

Phase 2+: HTTP server, QR air-gap export, Postgres. Phase 3: TEE signer.

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
  metadata: { model: "gpt-4o" },
});

console.log(await worm.verify()); // { valid: true }
```

SQLite + S3:

```typescript
import { WORMAuditTrail, SQLiteBackend, S3Backend } from "clawql-audit";

const worm = await WORMAuditTrail.create({
  local: new SQLiteBackend({ path: "./audit.db" }),
  remote: new S3Backend({
    endpoint: process.env.R2_ENDPOINT,
    bucket: "agent-audit-trail",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  }),
});
```

## Effect API

Prefer `makeWORMAuditTrailLayer` / `WORMAuditTrailService` inside ClawQL. The `WORMAuditTrail` class is a thin host façade (`Effect.runPromise` only).

## Not this package

The MCP `audit` tool ring buffer (`clawql-core` / `src/clawql-audit.ts`) is ephemeral operator breadcrumbs — a different product surface.
