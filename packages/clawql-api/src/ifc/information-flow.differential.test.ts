import { describe, expect, it } from "vitest";
import { emptyIfcFlowConfig, mayFlow, PUBLIC_LABEL, type Label } from "./labels.js";
import {
  LEAN_IFC_FIXTURES,
  leanOracleAccumulateLabels,
  leanOracleMayFlow,
  leanOracleMem,
  leanOracleWriteAllowed,
} from "./information-flow-oracle.js";

/**
 * Adapt production multi-dest `mayFlow` to the Lean single-dest oracle shape
 * (empty allow-list config).
 */
function productionMayFlowSingle(fromUnion: readonly Label[], dest: Label): boolean {
  return mayFlow(new Set(fromUnion), new Set([dest]), emptyIfcFlowConfig());
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("information-flow ↔ Lean oracle differential (ADR 0015)", () => {
  it("agrees on Lean fixture_* examples", () => {
    for (const f of LEAN_IFC_FIXTURES) {
      expect(leanOracleMayFlow(f.fromUnion, f.dest), f.name).toBe(f.expected);
      expect(leanOracleWriteAllowed(f.fromUnion, f.dest), f.name).toBe(f.expected);
      expect(productionMayFlowSingle(f.fromUnion, f.dest), f.name).toBe(f.expected);
    }
  });

  it("labels only grow under accumulate (Lean theorem 1)", () => {
    const before = ["source:a", "source:b"];
    const after = leanOracleAccumulateLabels(before, ["source:c", "source:a"]);
    for (const l of before) {
      expect(leanOracleMem(l, after)).toBe(true);
    }
    expect(after).toEqual(["source:a", "source:b", "source:c"]);
  });

  it("writeAllowed iff mayFlow (Lean theorem 2)", () => {
    const cases: Array<[readonly Label[], Label]> = [
      [[], "source:x"],
      [["source:x"], "source:x"],
      [["source:x"], "source:y"],
      [[PUBLIC_LABEL], "source:y"],
      [["source:x"], PUBLIC_LABEL],
    ];
    for (const [from, dest] of cases) {
      expect(leanOracleWriteAllowed(from, dest)).toBe(leanOracleMayFlow(from, dest));
    }
  });

  it("agrees with production mayFlow on 2000 random single-dest cases (empty config)", () => {
    const rnd = mulberry32(0x1fc0);
    const labels = [PUBLIC_LABEL, "source:github", "source:slack", "source:jira", "source:unknown"];
    let disagreements = 0;

    for (let i = 0; i < 2000; i++) {
      const n = Math.floor(rnd() * 4);
      const fromUnion = Array.from({ length: n }, () => labels[Math.floor(rnd() * labels.length)]!);
      const dest = labels[Math.floor(rnd() * labels.length)]!;
      const prod = productionMayFlowSingle(fromUnion, dest);
      const oracle = leanOracleMayFlow(fromUnion, dest);
      if (prod !== oracle) {
        disagreements += 1;
        if (disagreements === 1) {
          expect({ prod, oracle, fromUnion, dest }).toEqual({
            prod: oracle,
            oracle,
            fromUnion,
            dest,
          });
        }
      }
    }
    expect(disagreements).toBe(0);
  });
});
