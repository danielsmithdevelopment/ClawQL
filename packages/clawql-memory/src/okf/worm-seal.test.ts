import { describe, expect, it } from "vitest";
import { resolveWormRefForIngest, sealWormRefFromContent, wormSealEnabled } from "./worm-seal.js";

describe("worm-seal", () => {
  it("produces stable sha256: refs", () => {
    const a = sealWormRefFromContent("hello");
    const b = sealWormRefFromContent("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("explicit wormRef wins", () => {
    expect(resolveWormRefForIngest({ wormRef: "sha256:abc", sealedContent: "x" })).toBe(
      "sha256:abc"
    );
  });

  it("null wormRef means caller cleared sealing", () => {
    expect(resolveWormRefForIngest({ wormRef: null, sealedContent: "x" })).toBeNull();
  });

  it("defaults to sealing when enabled", () => {
    const saved = process.env.CLAWQL_MEMORY_WORM_SEAL;
    delete process.env.CLAWQL_MEMORY_WORM_SEAL;
    try {
      expect(wormSealEnabled()).toBe(true);
      const r = resolveWormRefForIngest({ sealedContent: "body" });
      expect(r).toMatch(/^sha256:/);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_MEMORY_WORM_SEAL;
      else process.env.CLAWQL_MEMORY_WORM_SEAL = saved;
    }
  });
});
