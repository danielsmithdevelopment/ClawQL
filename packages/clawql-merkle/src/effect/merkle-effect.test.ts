import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { HashChainService, HashChainServiceLive } from "./hash-chain-service.js";
import { MerkleService, MerkleServiceLive } from "./merkle-service.js";

describe("MerkleService", () => {
  it("builds snapshot via Effect", async () => {
    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const merkle = yield* MerkleService;
        return yield* merkle.buildSnapshot([{ path: "a.txt", bodySha256Hex: "ab".repeat(32) }]);
      }).pipe(Effect.provide(MerkleServiceLive))
    );
    expect(snapshot.leafCount).toBe(1);
    expect(snapshot.rootHex).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("HashChainService", () => {
  it("seals and verifies via Effect", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const chain = yield* HashChainService;
        const link = yield* chain.sealRecord({ event: "test" }, 1, "0".repeat(64));
        return yield* chain.verify([link]);
      }).pipe(Effect.provide(HashChainServiceLive))
    );
    expect(result.ok).toBe(true);
  });
});
