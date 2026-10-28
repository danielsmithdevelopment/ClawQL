import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FAIR_CONTRACT_ID } from "./types.js";
import { runFairDensityBoardEffect } from "./fair-board.js";

describe("fair density board (smoke)", () => {
  it("runs warmup + both wake orders and uses total-RSS resident accounting", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-density-fair-"));
    const evidence = await Effect.runPromise(
      runFairDensityBoardEffect({
        bagDir,
        rampSchedule: [40, 80],
        wakeSampleSize: 16,
        wakeWarmupCount: 24,
        rssCeilingMiB: 512,
        continueUntilCeiling: false,
        skipCold: false,
        skipRestart: false,
        hostLabel: "vitest-smoke",
      })
    );

    expect(evidence.kind).toBe(FAIR_CONTRACT_ID);
    expect(evidence.contract.definitions.rssCeiling).toBe("total_process_rss");

    const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
    // Tiny ramp under 512 MiB total RSS → ceiling not hit → methodology_pending.
    expect(clawql?.status).toBe("methodology_pending");
    expect(clawql?.boardColumns?.agentsAtLimit).toBe(80);
    expect(clawql?.boardColumns?.diskBytesPerAgent).toBeGreaterThan(20 * 1024);
    expect(clawql?.boardColumns?.wakeWarmMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.wakeColdMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.restartSurvival).toBe(true);

    const run = evidence.clawqlRun!;
    expect(run.rssCeilingDefinition).toBe("total_process_rss");
    expect(run.ceilingHit).toBe(false);
    expect(run.wakeWarmupCount).toBeGreaterThan(0);
    expect(run.wakeByOrder.map((o) => o.order)).toEqual(["warm_then_cold", "cold_then_warm"]);
    expect(run.residentAccounting.retainedInProcess).toMatch(/id index/i);
    expect(run.residentAccounting.totalRssKiBPerAgent).toBeGreaterThan(0);
    expect(run.residentAccounting.heapUsedKiBPerAgentAfterGc).toBeGreaterThan(0);
    // Board resident must be total RSS/N, not the (usually smaller) delta.
    expect(clawql?.boardColumns?.residentKiBPerAgent).toBe(
      run.residentAccounting.totalRssKiBPerAgent
    );

    const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
    expect(ont?.status).toBe("publishable");
    expect(evidence.rows.find((r) => r.systemId === "golem")?.status).toBe("pending_invite");
  }, 180_000);
});
