import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FAIR_CONTRACT_ID } from "./types.js";
import { runFairDensityBoardEffect } from "./fair-board.js";

describe("fair density board (smoke)", () => {
  it("measures ClawQL columns on a tiny ramp with restart survival", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-density-fair-"));
    const evidence = await Effect.runPromise(
      runFairDensityBoardEffect({
        bagDir,
        rampSchedule: [20, 50],
        wakeSampleSize: 10,
        rssCeilingMiB: 512,
        skipCold: false,
        skipRestart: false,
        hostLabel: "vitest-smoke",
      })
    );

    expect(evidence.kind).toBe(FAIR_CONTRACT_ID);
    const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
    expect(clawql?.status).toBe("measured");
    expect(clawql?.boardColumns?.agentsAtLimit).toBe(50);
    expect(clawql?.boardColumns?.diskBytesPerAgent).toBeGreaterThan(20 * 1024);
    expect(clawql?.boardColumns?.wakeWarmMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.wakeColdMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.restartSurvival).toBe(true);

    const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
    expect(ont?.status).toBe("publishable");
    expect(evidence.rows.find((r) => r.systemId === "golem")?.status).toBe("pending_invite");
  }, 120_000);
});
