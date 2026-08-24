---
title: "clawql-audit — Package Specification"
status: "target architecture · August 2026"
version: "0.1"
package: "packages/clawql-audit/"
npm: "clawql-audit"
---

# clawql-audit — Package Specification

**August 2026 · v0.1 · canonical**

> **Repo (2026-08-19):** `packages/clawql-merkle/` extracted. `packages/clawql-audit/` Phase 1 (Effect trail + in-memory dual-ack). SQLite/S3/HTTP/QR/TEE not built. Do not bind `:8080`/`:8091` while ExtractBench/Harvey listeners are up.
>
> **Related:** [Audit index](README.md) · [MCP `audit`](../mcp/mcp-tools.md) · [clawql-agents](../agents/clawql-agents-spec-v0.1.md) · [Personal agent](../homelab/personal-agent-hermes-cline.md) · [TEE air-gap QR](../streams/clawql-tee-airgap-audit.md) · [celld LTX](../streams/clawql-celld.md) · [Modularization](../design/modularization-implementation-status.md)

This document is the source of truth for implementers. Decisions below are closed.

| Topic                | Decision                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm name             | Unscoped `clawql-audit`. Scoped `@clawql/audit` is a later publish alias, not the workspace name.                                                                                                  |
| MCP `audit`          | Ephemeral hash-chained ring in `clawql-core`. Not this product. Core may _also_ depend on `clawql-audit` as a durable sink.                                                                        |
| Integrity primitives | Extract to `clawql-merkle` (Merkle tree + `sealHashChainRecord` / `verifyHashChain`). Vault, release, inference stores, and the MCP ring already use them — they must not import the WORM product. |
| Audit → core         | Forbidden. Audit depends on `clawql-merkle` only among ClawQL packages.                                                                                                                            |
| Replication          | `DualAckReplicator` + outbox. Not celld LTX. Not RPO=0.                                                                                                                                            |
| Chain fields         | `seq`, `prev_hash`, `hash` — same as shipped `clawql-core` hash-chain.                                                                                                                             |
| Construction         | `WORMAuditTrail.create()` only.                                                                                                                                                                    |
| Event types          | Closed union + `VENDOR_EXTENSION` / `metadata.vendorType`.                                                                                                                                         |
| QR                   | Keys from env/KMS. ECC **M**.                                                                                                                                                                      |
| Pricing              | $99/mo GTM. Not encoded in `clawql-payments`.                                                                                                                                                      |

**Locked DAG**

```
clawql-merkle          zero-dep: Merkle + hash-chain seal/verify
        ↑                    ↑
 clawql-core            clawql-audit
                             ↑
                       clawql-agents
 clawql-core may also depend on clawql-audit as WORM sink
```

---

## 1. Purpose and Positioning

`clawql-audit` is a standalone npm package providing tamper-evident WORM audit trail infrastructure for AI agent deployments. It works as an independent product for any agent framework and as the audit layer inside the full ClawQL stack.

The standalone constraint is architectural. `clawql-audit` has zero dependencies on `clawql-core`, `clawql-memory`, `clawql-inference`, or any other ClawQL **product** package. It depends on `clawql-merkle` for integrity primitives. A LangChain, LlamaIndex, AutoGen, OpenHands, or custom agent deployment can install it with no other ClawQL infrastructure.

**Positioning:** 120+ organizations including NVIDIA, Cisco, and CrowdStrike are pushing mandatory AI agent incident reporting. You cannot report an incident you did not record. `clawql-audit` answers: what did the agent do, when, what was it authorized to do, and what did it do outside that authorization.

**Sales motion:** a company deploying OpenHands or LangGraph searches for "AI agent audit trail", deploys `clawql-audit` in a day, and later buys retrieval, memory, and scope enforcement — already a ClawQL customer. Audit is the wedge.

**Pricing:** $99/month standalone. Included in ClawQL Business and above. Enterprise TEE adds hardware-attested entries and QR air-gap export.

---

## 2. Core Properties

**Append-only.** Written entries cannot be modified or deleted through the `clawql-audit` API. Storage enforces this on the write path. Reads return immutable snapshots.

**Hash-chained.** Each entry hash covers canonical JSON of the payload including `seq` and `prev_hash`. Gaps and edits are detectable by recomputing from storage. Sealing and verification use `clawql-merkle` (`sealHashChainRecord`, `verifyHashChain`) — one dialect, one function.

**Merkle roots (batch layer).** Periodically (session end, every N entries, or on demand) entry hashes are leaves of a Merkle tree via `clawql-merkle`. Inclusion proofs: "entry X is in root R" without the full log. Hash chain = append order. Merkle = inclusion. Not synonyms.

**Local durable + remote outbox (not RPO=0).** Every successful `append` commits the sealed entry to local storage (SQLite or Postgres). Remote (S3 or R2) is attempted before return. If remote succeeds, `backendAcks` is `['local','remote']`. If remote fails after retries, the same sealed bytes remain in a local outbox (inserted in the **same SQLite/Postgres transaction** as the entry) and `backendAcks` is `['local','remote_queued']`. The caller must **not** `append` again for that `seq`. `drainOutbox` runs on `create()` and before `query()`. Remote may lag; do not advertise RPO=0. (In-repo **LTX** is celld SQLite→bucket, a different mechanism.)

**Framework-agnostic.** Typed events plus free-form `metadata`.

**Optionally TEE-attested.** Inside clawql-tee, sign the entry `hash` with the hardware-derived key after sealing (signature is not part of the chained hash).

---

## 3. Package Structure

```
packages/clawql-audit/
  src/
    trail.ts
    entry.ts
    chain.ts                 # tip cache; seal/verify from clawql-merkle
    merkle.ts                # batch roots / proofs via clawql-merkle
    storage/
      types.ts
      sqlite.ts
      postgres.ts            # Phase 2
      s3.ts
      memory.ts              # tests
    replication/
      dual-ack.ts
      retry.ts
    tee/                     # Phase 3
      signer.ts
      verifier.ts
    query/
      filter.ts
      export.ts              # Phase 2 (QR)
    http/                    # Phase 2
      server.ts
      routes.ts
  index.ts
  package.json
  tsconfig.json
  README.md
```

---

## 4. Entry Schema

Unknown caller fields go in `metadata`. Do not extend `type` with `| string`.

Chain fields match `clawql-merkle` / today's `clawql-core` hash-chain: `seq`, `prev_hash`, `hash`. Genesis `prev_hash` is `HASH_CHAIN_GENESIS` (`0` repeated 64 times).

```typescript
export type BackendAck = "local" | "remote" | "remote_queued";

export interface WORMEntry {
  id: string;
  hash: string;
  prev_hash: string;
  seq: number;
  writtenAt: string;
  backendAcks: BackendAck[];

  type: WORMEntryType;
  timestamp: string;
  sessionId: string;
  agentName?: string;

  virtualKeyId?: string;
  cellId?: string;
  teeSignature?: string;
  metadata?: Record<string, unknown>;
}

export type WORMEntryType =
  | "SESSION_START"
  | "SESSION_END"
  | "INFERENCE_CALL"
  | "INFERENCE_RESULT"
  | "TOOL_CALL_ATTEMPT"
  | "TOOL_CALL_RESULT"
  | "PANGUARD_DENY"
  | "PANGUARD_ALLOW"
  | "BUDGET_EXHAUSTED"
  | "BUDGET_WARNING"
  | "AGENT_ACTION"
  | "AGENT_OBSERVATION"
  | "AGENT_DELEGATION"
  | "AGENT_DELEGATION_RESULT"
  | "HERMES_SKILL_QUERY"
  | "HERMES_SKILL_UPDATE"
  | "CRON_TRIGGER"
  | "CLINE_FILE_WRITE_ATTEMPT"
  | "CLINE_FILE_WRITE_RESULT"
  | "CLINE_TERMINAL_EXEC_ATTEMPT"
  | "CLINE_TERMINAL_EXEC_RESULT"
  | "CLINE_SESSION_START"
  | "CLINE_SESSION_END"
  | "OPENHANDS_ACTION"
  | "OPENHANDS_OBSERVATION"
  | "REASONING_CAPTURED_PLAINTEXT"
  | "REASONING_CAPTURED_ENCRYPTED"
  | "HUMAN_APPROVAL"
  | "HUMAN_REJECTION"
  | "HUMAN_DECISION_REQUESTED"
  | "BENCHMARK_TASK"
  | "SUSPICIOUS_MEMORY_CONTENT"
  | "VENDOR_EXTENSION";
```

Vendor-specific names: `type: "VENDOR_EXTENSION"` and `metadata.vendorType`.

`teeSignature` and `backendAcks` are **not** covered by `hash`. `sealHashChainRecord` hashes `{ ...payload, seq, prev_hash }` excluding `hash`. Apply TEE sign after seal.

---

## 5. WORMAuditTrail

Shipped seal API (moves to `clawql-merkle` in Phase 0):

```typescript
sealHashChainRecord<T extends Record<string, unknown>>(
  payload: T,
  seq: number,
  prevHash: string,
): T & { seq: number; prev_hash: string; hash: string };
```

```typescript
import { HASH_CHAIN_GENESIS, sealHashChainRecord, verifyHashChain } from "clawql-merkle";
import type { StorageBackend } from "./storage/types";
import { HashChain } from "./chain";
import { MerkleBatchLayer } from "./merkle";
import { DualAckReplicator } from "./replication/dual-ack";
import type { TEESigner } from "./tee/signer";
import type { WORMEntry, WORMFilter, ExportResult } from "./entry";

export interface WORMAuditTrailConfig {
  local: StorageBackend;
  remote: StorageBackend;
  tee?: TEESigner;
  httpPort?: number;
  retryMaxAttempts?: number;
  retryBackoffMs?: number;
  retryBackoffMultiplier?: number;
}

export class WORMAuditTrail {
  private constructor(
    private readonly chain: HashChain,
    private readonly merkle: MerkleBatchLayer,
    private readonly replicator: DualAckReplicator,
    private readonly tee: TEESigner | undefined
  ) {}

  /** Load chain tip and drain outbox before any append. */
  static async create(config: WORMAuditTrailConfig): Promise<WORMAuditTrail> {
    const chain = new HashChain();
    await chain.loadTip(config.local);
    const replicator = new DualAckReplicator(config.local, config.remote, {
      maxAttempts: config.retryMaxAttempts ?? 10,
      backoffMs: config.retryBackoffMs ?? 100,
      backoffMultiplier: config.retryBackoffMultiplier ?? 2,
    });
    await replicator.drainOutbox();
    return new WORMAuditTrail(chain, new MerkleBatchLayer(), replicator, config.tee);
  }

  async append(
    entry: Omit<WORMEntry, "id" | "hash" | "prev_hash" | "seq" | "writtenAt" | "backendAcks">
  ): Promise<WORMEntry> {
    const prev = this.chain.latest();
    const seq = (prev?.seq ?? -1) + 1;
    const prevHash = prev?.hash ?? HASH_CHAIN_GENESIS;
    const payload = {
      id: generateUUIDv7(),
      writtenAt: new Date().toISOString(),
      ...entry,
    };
    const sealed = sealHashChainRecord(payload, seq, prevHash);
    const signed = this.tee
      ? { ...sealed, teeSignature: await this.tee.sign(sealed.hash) }
      : sealed;
    const acks = await this.replicator.write(signed);
    const final: WORMEntry = { ...signed, backendAcks: acks };
    this.chain.update(final);
    return final;
  }

  async query(filter: WORMFilter): Promise<WORMEntry[]> {
    await this.replicator.drainOutbox();
    return this.replicator.query(filter);
  }

  /** Hash-chain integrity (not Merkle). */
  async verify(entries?: WORMEntry[]) {
    const toVerify = entries ?? (await this.replicator.all());
    return verifyHashChain(toVerify, { requireGenesis: true });
  }

  async export(filter: WORMFilter, format: "json" | "csv" | "qr"): Promise<ExportResult> {
    const entries = await this.query(filter);
    return exportEntries(entries, format);
  }

  merkleLayer(): MerkleBatchLayer {
    return this.merkle;
  }
}
```

Production: same operations as an Effect service; `create` is `Layer` construction. HTTP and the public SDK may `runPromise` at the edge.

---

## 6. Storage backends

### 6.1 SQLite (local)

```sql
CREATE TABLE IF NOT EXISTS worm_entries (
  id TEXT PRIMARY KEY,
  seq INTEGER UNIQUE NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  prev_hash TEXT NOT NULL,
  written_at TEXT NOT NULL,
  entry_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worm_outbox (
  id TEXT PRIMARY KEY REFERENCES worm_entries(id),
  entry_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session ON worm_entries
  ((json_extract(entry_json, '$.sessionId')));
CREATE INDEX IF NOT EXISTS idx_type ON worm_entries
  ((json_extract(entry_json, '$.type')));
CREATE INDEX IF NOT EXISTS idx_timestamp ON worm_entries
  ((json_extract(entry_json, '$.timestamp')));
```

`writeCommitted`: insert `worm_entries` only (remote already succeeded).

`writeWithOutbox`: **one transaction** — insert `worm_entries` and `worm_outbox` with the same `entry_json`. If the txn fails, throw (no seq consumed from the caller's point of view; do not update in-memory tip).

`latestEntry`: `ORDER BY seq DESC LIMIT 1`.

UNIQUE on `seq` rejects duplicate appends of the same index.

### 6.2 S3 / R2 (remote)

Key: `{prefix}{seq padded to 12}/{id}.json`. Unique keys; never reuse `id`.

Send `IfNoneMatch: '*'`. If the provider rejects the header, omit it and treat existing-object on drain as success (idempotent Put of identical bytes). If drain hits a 412 / "already exists", delete the outbox row.

Queries throw: read path is local only. Full bucket scan is disaster recovery, not `query()`.

### 6.3 DualAckReplicator

```typescript
export class DualAckReplicator {
  constructor(
    private local: StorageBackend,
    private remote: StorageBackend,
    private retry: RetryConfig
  ) {}

  /**
   * Local is source of truth. Remote is best-effort before return.
   * Never return ['local','remote'] unless S3/R2 succeeded.
   * Never reseal. Never ask the caller to append the same event again.
   */
  async write(entry: Omit<WORMEntry, "backendAcks">): Promise<BackendAck[]> {
    try {
      await withRetry(() => this.remote.write(entry as WORMEntry), this.retry);
      await this.local.writeCommitted(entry as WORMEntry);
      return ["local", "remote"];
    } catch {
      await this.local.writeWithOutbox(entry as WORMEntry);
      return ["local", "remote_queued"];
    }
  }

  async drainOutbox(): Promise<void> {
    for (const entry of await this.local.outboxList()) {
      try {
        await withRetry(() => this.remote.write(entry), this.retry);
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
      await this.local.outboxDelete(entry.id);
    }
  }

  async query(filter: WORMFilter): Promise<WORMEntry[]> {
    return this.local.query(filter);
  }

  async all(): Promise<WORMEntry[]> {
    return this.local.all();
  }
}
```

Write order when remote is up: remote first, then local without outbox. If remote fails: local+outbox in one txn (entry never appears locally without an outbox row). Crash after remote success and before `writeCommitted`: drain will retry Put; unique key + already-exists = success, then local insert. If that local insert races UNIQUE, load tip from DB (create path already `loadTip`).

---

## 7. Hash chain and Merkle batch layer

### 7.1 HashChain

In-memory tip only after `loadTip(local)` on create. `update` requires `entry.seq === latest.seq + 1`. Trail `verify` calls `verifyHashChain` from `clawql-merkle` — do not reimplement hashing here.

### 7.2 MerkleBatchLayer

Import only from `clawql-merkle`. Shipped APIs:

- `buildMerkleSnapshot(rows: { path: string; bodySha256Hex: string }[])` — sorts by `path`
- `merkleProof(snapshot, leafIndex): Buffer[]`
- `verifyMerkleProof(leafHash: Buffer, leafIndex, leafCount, proof, expectedRootHex): boolean`

Use `path = String(seq).padStart(12, "0")` and `bodySha256Hex = entry.hash` so lex order = chain order. Sort the batch by `seq` before building.

```typescript
import { buildMerkleSnapshot, merkleProof, verifyMerkleProof } from "clawql-merkle";

export interface MerkleRoot {
  rootHex: string;
  fromSeq: number;
  toSeq: number;
  entryCount: number;
  computedAt: string;
}

export interface MerkleInclusionProof {
  entryId: string;
  entryHash: string;
  rootHex: string;
  leafIndex: number;
  leafCount: number;
  siblingsHex: string[];
  valid: boolean;
}

export class MerkleBatchLayer {
  private rows(entries: WORMEntry[]) {
    return [...entries]
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({
        path: String(e.seq).padStart(12, "0"),
        bodySha256Hex: e.hash,
      }));
  }

  buildRoot(entries: WORMEntry[]): MerkleRoot {
    const rows = this.rows(entries);
    const snapshot = buildMerkleSnapshot(rows);
    return {
      rootHex: snapshot.rootHex,
      fromSeq: rows[0]!.seq,
      toSeq: rows[rows.length - 1]!.seq,
      entryCount: rows.length,
      computedAt: new Date().toISOString(),
    };
  }

  prove(entry: WORMEntry, batchEntries: WORMEntry[]): MerkleInclusionProof {
    const rows = this.rows(batchEntries);
    const snapshot = buildMerkleSnapshot(rows);
    const leafIndex = rows.findIndex((r) => r.path === String(entry.seq).padStart(12, "0"));
    if (leafIndex < 0) throw new Error(`Entry ${entry.id} not in batch`);
    const proof = merkleProof(snapshot, leafIndex);
    const valid = verifyMerkleProof(
      snapshot.leaves[leafIndex]!,
      leafIndex,
      snapshot.leafCount,
      proof,
      snapshot.rootHex
    );
    return {
      entryId: entry.id,
      entryHash: entry.hash,
      rootHex: snapshot.rootHex,
      leafIndex,
      leafCount: snapshot.leafCount,
      siblingsHex: proof.map((b) => b.toString("hex")),
      valid,
    };
  }

  verify(proof: MerkleInclusionProof, leafHash: Buffer): boolean {
    return verifyMerkleProof(
      leafHash,
      proof.leafIndex,
      proof.leafCount,
      proof.siblingsHex.map((h) => Buffer.from(h, "hex")),
      proof.rootHex
    );
  }
}
```

---

## 8. QR air-gap export (Phase 2)

Keys from environment / KMS at process start, never from the request body:

- `CLAWQL_AUDIT_QR_ENCRYPTION_KEY` (32-byte hex)
- `CLAWQL_AUDIT_QR_HMAC_KEY` (32-byte hex)

If either is missing, `POST /export/qr` returns **503**. Align ECC with [`clawql-tee-airgap-audit.md`](../streams/clawql-tee-airgap-audit.md): **M**.

CBOR payload → RaptorQ chunks → ChaCha20 → HMAC-SHA256 per chunk → QR. Include last entry `hash` as `chainRoot` on each chunk.

---

## 9. HTTP server (Phase 2)

Requires `Authorization: ApiKey …` on every request. API key from env, never stored in entries.

| Method | Path            | Body / query                                             | Notes               |
| ------ | --------------- | -------------------------------------------------------- | ------------------- |
| POST   | `/entries`      | caller fields only                                       | same as `append`    |
| GET    | `/entries`      | `sessionId`, `type`, `since`, `until`, `limit`, `offset` | drains outbox first |
| GET    | `/entries/:id`  |                                                          |                     |
| GET    | `/chain/verify` | optional `sessionId`                                     | `verifyHashChain`   |
| GET    | `/chain/latest` |                                                          |                     |
| POST   | `/export/qr`    | `{ filter }` only                                        | keys from env       |

---

## 10. TEE attestation (Phase 3)

`TEESigner.sign(hash)` — ECDSA P-256 over the hex hash bytes. Verifier checks the attestation report, then `crypto.subtle.verify` against `entry.hash`. Depends on clawql-tee hardware key availability.

---

## 11. Usage without ClawQL

```typescript
import { WORMAuditTrail } from "clawql-audit";
import { SQLiteBackend } from "clawql-audit/storage/sqlite";
import { S3Backend } from "clawql-audit/storage/s3";

const worm = await WORMAuditTrail.create({
  local: new SQLiteBackend("./audit.db"),
  remote: new S3Backend({
    endpoint: "https://r2.your-account.cloudflare.com",
    bucket: "agent-audit-trail",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  }),
});

const sessionId = "sess_" + crypto.randomUUID();

await worm.append({
  type: "SESSION_START",
  timestamp: new Date().toISOString(),
  sessionId,
  agentName: "langchain-sql-agent",
  metadata: { model: "gpt-4o", task: "quarterly report analysis" },
});

const verification = await worm.verify();
```

---

## 12. Usage inside ClawQL

`clawql-core` constructs the trail with `create()` (Postgres + R2, optional `TEESigner`) and writes from execute / Panguard. MCP `audit` remains the RAM ring. `clawql-agents` appends non-MCP actions (Cline file writes, Hermes skill updates, OpenHands event stream).

---

## 13. Package dependencies

```json
{
  "name": "clawql-audit",
  "version": "0.1.0",
  "description": "Tamper-evident WORM audit trail for AI agent deployments",
  "dependencies": {
    "clawql-merkle": "workspace:*",
    "@aws-sdk/client-s3": "^3.0.0",
    "better-sqlite3": "^9.0.0",
    "cbor": "^9.0.0"
  },
  "optionalDependencies": {
    "pg": "^8.0.0"
  }
}
```

Phase 2+ add RaptorQ / QR libraries as needed. CI: `clawql-audit` must not depend on `clawql-core`, `clawql-memory`, or `clawql-inference` (unscoped names). `clawql-merkle` is required.

---

## 14. Architectural constraint

`clawql-merkle` is the shared integrity package. `clawql-audit` must not import `clawql-core`. `clawql-core` and `clawql-agents` may depend on `clawql-audit`. Merkle and hash-chain stay out of audit so vault snapshots, release artifacts, inference stores, and the MCP ring do not take SQLite/S3 as a dependency.

---

## 15. Implementation sequence

**Phase 0:** Extract `packages/clawql-merkle/` from `clawql-core` (`merkle-tree.ts` + `hash-chain/`). Point core at it. Tests stay green.

**Phase 1:** Effect trail, SQLite, S3/R2, DualAck + outbox, `verifyHashChain`, Merkle batch roots. append / query / verify. Publish `0.1.0`.

**Phase 2:** HTTP, QR export, Postgres.

**Phase 3:** TEE signer / verifier.

**Phase 4:** npm README that does not require knowing ClawQL.

**Then** `clawql-agents` (Cline first).

---

_clawql-audit Package Specification · v0.1 canonical · August 2026_
_Target: packages/clawql-audit/ · npm: clawql-audit_
_Contact: daniel@clawql.com_
