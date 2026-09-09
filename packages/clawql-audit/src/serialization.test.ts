import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  DEFAULT_CBOR_CHAIN_METADATA,
  LEGACY_JSON_CHAIN_METADATA,
  MemoryBackend,
  WORMAuditTrail,
  deserializeWormEntry,
  formatAtIndex,
  recomputeEntryHash,
  resolveChainMetadata,
  sealHashChainRecord,
  serializeWormEntry,
  WORM_GENESIS_PREV_HASH,
} from "./index.js";

const trailDefaults = {
  retryMaxAttempts: 2,
  retryBackoffMs: 1,
  reconcileIntervalMs: 0,
  merkleBatchSize: 0,
} as const;

describe("WormSerialization", () => {
  it("round-trips CBOR payload with stable key order", async () => {
    const payload = {
      id: "00000000-0000-7000-8000-000000000001",
      prevHash: WORM_GENESIS_PREV_HASH,
      chainIndex: 0,
      writtenAt: "2026-01-01T00:00:00.000Z",
      type: "SESSION_START" as const,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "s1",
      metadata: { z: 1, a: 2 },
    };
    const a = await Effect.runPromise(serializeWormEntry(payload, "cbor"));
    const b = await Effect.runPromise(
      serializeWormEntry(
        {
          ...payload,
          metadata: { a: 2, z: 1 },
        },
        "cbor"
      )
    );
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const back = await Effect.runPromise(deserializeWormEntry(a, "cbor"));
    expect(back.sessionId).toBe("s1");
    expect(back.metadata).toEqual({ a: 2, z: 1 });
  });

  it("CBOR and JSON dialects produce different hashes for the same content", async () => {
    const sealedCbor = await Effect.runPromise(
      sealHashChainRecord({
        prev: null,
        body: {
          id: "00000000-0000-7000-8000-000000000001",
          writtenAt: "2026-01-01T00:00:00.000Z",
          type: "SESSION_START",
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "s1",
        },
        serializationVersion: "cbor",
      })
    );
    const sealedJson = await Effect.runPromise(
      sealHashChainRecord({
        prev: null,
        body: {
          id: "00000000-0000-7000-8000-000000000001",
          writtenAt: "2026-01-01T00:00:00.000Z",
          type: "SESSION_START",
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "s1",
        },
        serializationVersion: "json",
      })
    );
    expect(sealedCbor.hash).not.toBe(sealedJson.hash);
    expect(
      await Effect.runPromise(
        recomputeEntryHash({ ...sealedCbor, backendAcks: [] }, "cbor")
      )
    ).toBe(sealedCbor.hash);
    expect(
      await Effect.runPromise(
        recomputeEntryHash({ ...sealedJson, backendAcks: [] }, "json")
      )
    ).toBe(sealedJson.hash);
  });

  it("formatAtIndex honors one-time switch", () => {
    const meta = {
      serializationVersion: "cbor" as const,
      versionChangedAtIndex: 2,
    };
    expect(formatAtIndex(meta, 0)).toBe("json");
    expect(formatAtIndex(meta, 1)).toBe("json");
    expect(formatAtIndex(meta, 2)).toBe("cbor");
    expect(formatAtIndex(DEFAULT_CBOR_CHAIN_METADATA, 99)).toBe("cbor");
    expect(formatAtIndex(LEGACY_JSON_CHAIN_METADATA, 0)).toBe("json");
  });

  it("resolveChainMetadata defaults to CBOR", () => {
    expect(resolveChainMetadata(undefined, null)).toEqual(DEFAULT_CBOR_CHAIN_METADATA);
    expect(resolveChainMetadata(LEGACY_JSON_CHAIN_METADATA, null)).toEqual(
      LEGACY_JSON_CHAIN_METADATA
    );
  });

  it("verifies a mixed JSON→CBOR chain via versionChangedAtIndex", async () => {
    const local = new MemoryBackend();
    const remote = new MemoryBackend();

    const legacy = await WORMAuditTrail.create({
      local,
      remote,
      ...trailDefaults,
      chainMetadata: LEGACY_JSON_CHAIN_METADATA,
    });
    await legacy.append({
      type: "SESSION_START",
      timestamp: "2026-09-01T00:00:00.000Z",
      sessionId: "mix",
    });
    await legacy.append({
      type: "TOOL_CALL_ATTEMPT",
      timestamp: "2026-09-01T00:00:01.000Z",
      sessionId: "mix",
    });
    await legacy.stop();

    const migrated = await WORMAuditTrail.create({
      local,
      remote,
      ...trailDefaults,
      chainMetadata: {
        serializationVersion: "cbor",
        versionChangedAtIndex: 2,
      },
    });
    await migrated.append({
      type: "TOOL_CALL_RESULT",
      timestamp: "2026-09-01T00:00:02.000Z",
      sessionId: "mix",
    });
    const verification = await migrated.verify();
    expect(verification).toEqual({ valid: true });
    const rows = await migrated.query({ sessionId: "mix" });
    expect(rows).toHaveLength(3);
    expect(await Effect.runPromise(recomputeEntryHash(rows[0]!, "json"))).toBe(rows[0]!.hash);
    expect(await Effect.runPromise(recomputeEntryHash(rows[2]!, "cbor"))).toBe(rows[2]!.hash);
    await migrated.stop();
  });
});
