import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryBackend,
  MerkleBatchLayer,
  S3Backend,
  SQLiteBackend,
  WORMAuditTrail,
  WORM_GENESIS_PREV_HASH,
  sealHashChainRecord,
  type StorageBackend,
  type WORMEntry,
} from "./index.js";
import { AuditError } from "./errors.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));

describe("package constraint", () => {
  it("depends only on clawql-merkle among clawql-* packages", () => {
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const all = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    };
    for (const name of Object.keys(all)) {
      if (name.startsWith("clawql-") && name !== "clawql-merkle") {
        throw new Error(`Forbidden ClawQL dependency: ${name}`);
      }
    }
    expect(all["clawql-merkle"]).toBeDefined();
  });
});

const trailDefaults = {
  retryMaxAttempts: 2,
  retryBackoffMs: 1,
  reconcileIntervalMs: 0,
  merkleBatchSize: 0,
} as const;

describe("sealHashChainRecord", () => {
  it("seals genesis and links the next entry", async () => {
    const first = await Effect.runPromise(
      sealHashChainRecord({
        prev: null,
        body: {
          id: "00000000-0000-7000-8000-000000000001",
          writtenAt: "2026-01-01T00:00:00.000Z",
          type: "SESSION_START",
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "s1",
        },
      })
    );
    expect(first.chainIndex).toBe(0);
    expect(first.prevHash).toBe(WORM_GENESIS_PREV_HASH);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);

    const second = await Effect.runPromise(
      sealHashChainRecord({
        prev: { hash: first.hash, seq: first.chainIndex },
        body: {
          id: "00000000-0000-7000-8000-000000000002",
          writtenAt: "2026-01-01T00:00:01.000Z",
          type: "TOOL_CALL_ATTEMPT",
          timestamp: "2026-01-01T00:00:01.000Z",
          sessionId: "s1",
        },
      })
    );
    expect(second.chainIndex).toBe(1);
    expect(second.prevHash).toBe(first.hash);
  });
});

describe("WORMAuditTrail (memory dual-ack)", () => {
  it("appends, queries, verifies, and builds merkle proofs", async () => {
    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
    });

    const a = await worm.append({
      type: "SESSION_START",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "sess_1",
      agentName: "demo",
      metadata: { model: "gpt-4o" },
    });
    const b = await worm.append({
      type: "TOOL_CALL_ATTEMPT",
      timestamp: "2026-08-01T12:00:01.000Z",
      sessionId: "sess_1",
      agentName: "demo",
      metadata: { toolName: "sql_query" },
    });

    expect(a.chainIndex).toBe(0);
    expect(b.chainIndex).toBe(1);
    expect(b.prevHash).toBe(a.hash);
    expect(a.backendAcks).toEqual(["local", "remote"]);

    const rows = await worm.query({ sessionId: "sess_1" });
    expect(rows).toHaveLength(2);

    const verification = await worm.verify();
    expect(verification).toEqual({ valid: true });

    const root = await worm.buildMerkleRoot(rows);
    expect(root.entryCount).toBe(2);
    const proof = await worm.proveInclusion(a, rows);
    expect(await worm.verifyInclusion(proof)).toBe(true);

    const json = await worm.export({ sessionId: "sess_1" }, "json");
    expect(json.format).toBe("json");
    expect(json.entryCount).toBe(2);
  });

  it("queues remote failures in outbox and drains later", async () => {
    const local = new MemoryBackend();
    let failRemote = true;
    const remote: StorageBackend = {
      write: () =>
        failRemote ? Effect.fail(new AuditError({ reason: "remote down" })) : Effect.void,
      query: () => Effect.fail(new AuditError({ reason: "no query" })),
      all: () => Effect.fail(new AuditError({ reason: "no all" })),
      latestEntry: () => Effect.fail(new AuditError({ reason: "no latest" })),
    };

    const worm = await WORMAuditTrail.create({
      local,
      remote,
      ...trailDefaults,
    });

    await worm.append({
      type: "SESSION_START",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "sess_outbox",
    });

    const pending = await Effect.runPromise(local.outboxList());
    expect(pending).toHaveLength(1);

    failRemote = true; // still failing — drain should fail
    await expect(worm.drainOutbox()).rejects.toBeTruthy();

    failRemote = false;
    await worm.drainOutbox();
    expect(await Effect.runPromise(local.outboxList())).toHaveLength(0);
  });

  it("detects tampering on verify", async () => {
    const worm = await WORMAuditTrail.create({
      local: new MemoryBackend(),
      remote: new MemoryBackend(),
      ...trailDefaults,
      retryMaxAttempts: 1,
    });
    const entry = await worm.append({
      type: "AGENT_ACTION",
      timestamp: "2026-08-01T12:00:00.000Z",
      sessionId: "sess_tamper",
    });
    const tampered: WORMEntry = {
      ...entry,
      metadata: { evil: true },
    };
    const result = await worm.verify([tampered]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Hash mismatch/);
  });
});

describe("SQLiteBackend", () => {
  it("persists chain across reopen and supports tip load", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clawql-audit-"));
    const path = join(dir, "audit.db");
    try {
      const local = new SQLiteBackend({ path });
      const remote = new MemoryBackend();
      const worm = await WORMAuditTrail.create({
        local,
        remote,
        ...trailDefaults,
      });
      await worm.append({
        type: "SESSION_START",
        timestamp: "2026-08-01T12:00:00.000Z",
        sessionId: "sess_sqlite",
      });
      local.close();

      const local2 = new SQLiteBackend({ path });
      const worm2 = await WORMAuditTrail.create({
        local: local2,
        remote: new MemoryBackend(),
        ...trailDefaults,
      });
      const next = await worm2.append({
        type: "SESSION_END",
        timestamp: "2026-08-01T12:01:00.000Z",
        sessionId: "sess_sqlite",
      });
      expect(next.chainIndex).toBe(1);
      expect((await worm2.verify()).valid).toBe(true);
      local2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("S3Backend", () => {
  it("writes with zero-padded key via injected client", async () => {
    const puts: { Key?: string }[] = [];
    const backend = new S3Backend({
      bucket: "test-bucket",
      client: {
        send: async (cmd) => {
          puts.push(cmd.input);
          return {};
        },
      },
    });
    const entry: WORMEntry = {
      id: "id-1",
      hash: "ab".repeat(32),
      prevHash: WORM_GENESIS_PREV_HASH,
      chainIndex: 7,
      writtenAt: "2026-08-01T00:00:00.000Z",
      backendAcks: [],
      type: "SESSION_START",
      timestamp: "2026-08-01T00:00:00.000Z",
      sessionId: "s",
    };
    await Effect.runPromise(backend.write(entry));
    expect(puts[0]?.Key).toBe(`worm/${"7".padStart(12, "0")}/id-1.json`);
  });
});

describe("MerkleBatchLayer", () => {
  it("rejects empty batch", async () => {
    const layer = new MerkleBatchLayer();
    await expect(Effect.runPromise(layer.buildRoot([]))).rejects.toBeTruthy();
  });
});
