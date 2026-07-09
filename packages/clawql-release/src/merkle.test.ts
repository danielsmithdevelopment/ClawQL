import { describe, expect, it } from "vitest";
import { merkleRootFromLeaves } from "./merkle.js";

describe("merkleRootFromLeaves", () => {
  it("is stable for sorted artifact ids", () => {
    const a = merkleRootFromLeaves([
      { id: "artifacts/npm", sha256: "aa".repeat(32) },
      { id: "artifacts/sbom", sha256: "bb".repeat(32) },
    ]);
    const b = merkleRootFromLeaves([
      { id: "artifacts/sbom", sha256: "bb".repeat(32) },
      { id: "artifacts/npm", sha256: "aa".repeat(32) },
    ]);
    expect(a.merkleRoot).toBe(b.merkleRoot);
    expect(a.leafCount).toBe(2);
  });
});
