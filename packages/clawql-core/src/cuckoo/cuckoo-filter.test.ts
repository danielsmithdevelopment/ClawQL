import { describe, expect, it } from "vitest";
import { CuckooFilter, fingerprintFromKey } from "./cuckoo-filter.js";

describe("CuckooFilter", () => {
  it("round-trips serialize/deserialize and preserves membership", () => {
    const keys = ["a", "b", "c", "chunk|x|paragraph_v1|0|deadbeef"];
    const f = CuckooFilter.fromKeys(keys, { fingerprintBits: 12 });
    const copy = CuckooFilter.deserialize(f.serialize());
    for (const k of keys) {
      expect(copy.maybeContains(k)).toBe(true);
    }
    expect(copy.maybeContains("absent-key-" + "z".repeat(40))).toBe(false);
  });

  it("fingerprintFromKey is stable for same input", () => {
    expect(fingerprintFromKey("same", 12)).toBe(fingerprintFromKey("same", 12));
  });
});
