import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { WORMAuditTrail, makeWORMAuditTrailLayer } from "./trail.js";
import { createFailingRemoteBackend, createMemoryBackend } from "./storage/memory.js";

const sample = {
  type: "SESSION_START" as const,
  timestamp: "2026-08-19T00:00:00.000Z",
  sessionId: "sess_1",
  agentName: "test",
};

describe("WORMAuditTrail", () => {
  it("seals a hash chain and dual-acks memory backends", async () => {
    const layer = makeWORMAuditTrailLayer({
      local: createMemoryBackend(),
      remote: createMemoryBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        const a = yield* worm.append(sample);
        const b = yield* worm.append({ ...sample, type: "SESSION_END" });
        const verified = yield* worm.verify();
        return { a, b, verified };
      }).pipe(Effect.provide(layer))
    );
    expect(result.a.seq).toBe(0);
    expect(result.a.backendAcks).toEqual(["local", "remote"]);
    expect(result.b.prev_hash).toBe(result.a.hash);
    expect(result.verified.ok).toBe(true);
    expect(result.verified.fromGenesis).toBe(true);
  });

  it("queues remote without resealing when S3-equivalent fails", async () => {
    const layer = makeWORMAuditTrailLayer({
      local: createMemoryBackend(),
      remote: createFailingRemoteBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    const entry = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        return yield* worm.append(sample);
      }).pipe(Effect.provide(layer))
    );
    expect(entry.backendAcks).toEqual(["local", "remote_queued"]);
    expect(entry.seq).toBe(0);
  });

  it("builds a Merkle inclusion proof over sealed hashes", async () => {
    const layer = makeWORMAuditTrailLayer({
      local: createMemoryBackend(),
      remote: createMemoryBackend(),
      retry: { maxAttempts: 1, backoffMs: 1, backoffMultiplier: 1 },
    });
    const proof = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrail;
        const a = yield* worm.append(sample);
        const b = yield* worm.append({ ...sample, type: "TOOL_CALL_ATTEMPT" });
        return yield* worm.merkle.prove(a, [a, b]);
      }).pipe(Effect.provide(layer))
    );
    expect(proof.valid).toBe(true);
    expect(proof.leafCount).toBe(2);
  });
});
