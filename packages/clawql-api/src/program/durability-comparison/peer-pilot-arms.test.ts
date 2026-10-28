/**
 * Smoke: one trial per peer pilot arm × both upstream modes (fast CI).
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { golemArm, golemClawqlArm, piDurableArm, piDurableClawqlArm } from "./peer-pilot-arms.js";

describe("peer pilot stand-in arms", () => {
  it("golem: key masks on idempotent; duplicates effects without keys", async () => {
    const result = await Effect.runPromise(golemArm.run({ n: 1 }));
    expect(result.status).toBe("pilot_standin");
    expect(result.modes).toHaveLength(2);
    const idem = result.modes.find((m) => m.upstreamMode === "idempotent");
    const non = result.modes.find((m) => m.upstreamMode === "non_idempotent");
    expect(idem?.boardPass).toBe(true);
    expect(idem?.duplicates).toBe(1);
    expect(idem?.uniqueWriteEffects).toBe(1);
    expect(non?.boardPass).toBe(true);
    expect(non?.duplicates).toBe(1);
    expect(non?.uniqueWriteEffects).toBe(2);
  }, 60_000);

  it("pi-durable: interrupted unknown, no re-send", async () => {
    const result = await Effect.runPromise(piDurableArm.run({ n: 1 }));
    expect(result.status).toBe("pilot_standin");
    for (const mode of result.modes) {
      expect(mode.boardPass).toBe(true);
      expect(mode.duplicates).toBe(0);
      expect(mode.outcomeUnknown).toBe(1);
    }
  }, 60_000);

  it("combination arms: ClawQL gate → 0 dups + unknown", async () => {
    for (const arm of [golemClawqlArm, piDurableClawqlArm]) {
      const result = await Effect.runPromise(arm.run({ n: 1 }));
      expect(result.status).toBe("pilot_standin");
      for (const mode of result.modes) {
        expect(mode.boardPass).toBe(true);
        expect(mode.duplicates).toBe(0);
        expect(mode.outcomeUnknown).toBeGreaterThanOrEqual(1);
      }
    }
  }, 120_000);
});
