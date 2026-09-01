import { describe, expect, it } from "vitest";
import { HASH_CHAIN_GENESIS, sealHashChainRecord, verifyHashChain } from "./hash-chain.js";

describe("hash-chain", () => {
  it("seals and verifies a genesis chain", () => {
    const a = sealHashChainRecord(
      { category: "t", action: "x", summary: "one" },
      1,
      HASH_CHAIN_GENESIS
    );
    const b = sealHashChainRecord({ category: "t", action: "x", summary: "two" }, 2, a.hash);
    const result = verifyHashChain([a, b], { requireGenesis: true });
    expect(result.ok).toBe(true);
    expect(result.fromGenesis).toBe(true);
    expect(result.records).toBe(2);
    expect(b.prev_hash).toBe(a.hash);
  });

  it("canonical JSON ignores key insertion order", () => {
    const a = sealHashChainRecord({ z: 1, a: 2 }, 1, HASH_CHAIN_GENESIS);
    const b = sealHashChainRecord({ a: 2, z: 1 }, 1, HASH_CHAIN_GENESIS);
    expect(a.hash).toBe(b.hash);
  });

  it("detects payload tampering", () => {
    const a = sealHashChainRecord({ summary: "ok" }, 1, HASH_CHAIN_GENESIS);
    const tampered = { ...a, summary: "nope" };
    const result = verifyHashChain([tampered]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.reason).toMatch(/hash mismatch/);
  });

  it("verifies a retained window that does not start at genesis", () => {
    const a = sealHashChainRecord({ summary: "dropped" }, 1, HASH_CHAIN_GENESIS);
    const b = sealHashChainRecord({ summary: "kept" }, 2, a.hash);
    const c = sealHashChainRecord({ summary: "also" }, 3, b.hash);
    const window = verifyHashChain([b, c], { requireGenesis: false });
    expect(window.ok).toBe(true);
    expect(window.fromGenesis).toBe(false);
    const full = verifyHashChain([b, c], { requireGenesis: true });
    expect(full.ok).toBe(false);
  });

  it("omits backendAcks and teeSignature from the chained hash", () => {
    const a = sealHashChainRecord({ summary: "ok" }, 1, HASH_CHAIN_GENESIS);
    const withAcks = { ...a, backendAcks: ["local", "remote"], teeSignature: "sig" };
    const result = verifyHashChain([withAcks], { requireGenesis: true });
    expect(result.ok).toBe(true);
  });
});
