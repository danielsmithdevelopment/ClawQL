import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FAIR_CONTRACT_ID } from "./types.js";
import { runFairDensityBoardEffect } from "./fair-board.js";

describe("fair density board (smoke)", () => {
  it("runs multi-rep wake alternation, total-RSS resident accounting, and first-resource limit", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-density-fair-"));
    const evidence = await Effect.runPromise(
      runFairDensityBoardEffect({
        bagDir,
        rampSchedule: [40, 80],
        wakeSampleSize: 16,
        wakeWarmupCount: 24,
        wakeOrderRepetitions: 2,
        rssCeilingMiB: 512,
        continueUntilCeiling: false,
        skipCold: false,
        skipRestart: false,
        hostLabel: "vitest-smoke",
      })
    );

    expect(evidence.kind).toBe(FAIR_CONTRACT_ID);
    expect(evidence.contract.definitions.rssCeiling).toBe("total_process_rss");
    expect(evidence.contract.definitions.agentsAtLimit).toBe("first_resource_exhausted");

    const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
    // Tiny ramp under 512 MiB with ample disk → no resource exhausted → methodology_pending.
    expect(clawql?.status).toBe("methodology_pending");
    expect(clawql?.boardColumns?.agentsAtLimit).toBe(80);
    expect(clawql?.boardColumns?.limitResource).toBe("none");
    expect(clawql?.boardColumns?.diskBytesPerAgent).toBeGreaterThan(20 * 1024);
    expect(clawql?.boardColumns?.wakeWarmMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.wakeColdMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.restartSurvival).toBe(true);

    const run = evidence.clawqlRun!;
    expect(run.rssCeilingDefinition).toBe("total_process_rss");
    expect(run.limitHit).toBe(false);
    expect(run.ceilingHit).toBe(false);
    expect(run.limitResource).toBe("none");
    expect(run.idIndexRetainedAtLimit).toBe(true);
    expect(run.residentAccounting.idIndexEntries).toBe(80);
    expect(run.residentAccounting.idIndexShape).toBe("agentId_to_bag_path_map");
    expect(run.wakeWarmupCount).toBeGreaterThan(0);
    expect(run.wakeOrderRepetitions).toBe(2);
    expect(run.wakeByOrder).toHaveLength(4); // 2 reps × 2 orders
    expect(run.wakeByOrder.map((o) => o.order)).toEqual([
      "warm_then_cold",
      "cold_then_warm",
      "warm_then_cold",
      "cold_then_warm",
    ]);
    expect(run.wakeSpread).toHaveLength(2);
    for (const s of run.wakeSpread) {
      expect(s.repetitions).toBe(2);
      expect(s.coldP99Max).toBeGreaterThanOrEqual(s.coldP99Min);
      expect(s.coldP99Median).toBeGreaterThanOrEqual(s.coldP99Min);
      expect(s.coldP99Median).toBeLessThanOrEqual(s.coldP99Max);
    }
    expect(["warm_then_cold", "cold_then_warm"]).toContain(run.wakeHeadlineOrder);
    expect(run.residentAccounting.retainedInProcess).toMatch(/Map<agentId, bagPath>/);
    expect(run.residentAccounting.totalRssKiBPerAgent).toBeGreaterThan(0);
    expect(run.residentAccounting.heapUsedKiBPerAgentAfterGc).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.residentKiBPerAgent).toBe(
      run.residentAccounting.totalRssKiBPerAgent
    );
    expect(run.ramp.every((s) => s.diskAvailBytes !== undefined)).toBe(true);

    const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
    expect(ont?.status).toBe("publishable");
    expect(ont?.boardColumns?.limitResource).toBe("rss");
    expect(evidence.rows.find((r) => r.systemId === "golem")?.status).toBe("pending_invite");
  }, 300_000);
});
