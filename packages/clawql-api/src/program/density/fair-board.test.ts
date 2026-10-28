import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FAIR_CONTRACT_ID } from "./types.js";
import { runFairDensityBoardEffect } from "./fair-board.js";

describe("fair density board (smoke)", () => {
  it("retains deadline schedule, measures lateness, and reports wake spread", async () => {
    const bagDir = await mkdtemp(join(tmpdir(), "clawql-density-fair-"));
    const evidence = await Effect.runPromise(
      runFairDensityBoardEffect({
        bagDir,
        rampSchedule: [40, 80],
        wakeSampleSize: 16,
        wakeWarmupCount: 24,
        wakeOrderRepetitions: 2,
        deadlineHorizonMs: 1_500,
        deadlineMaxFires: 40,
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
    expect(evidence.contract.definitions.retainedAtLimit).toBe("wake_deadline_schedule");

    const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
    expect(clawql?.status).toBe("methodology_pending");
    expect(clawql?.boardColumns?.agentsAtLimit).toBe(80);
    expect(clawql?.boardColumns?.limitResource).toBe("none");
    expect(clawql?.boardColumns?.diskBytesPerAgent).toBeGreaterThan(20 * 1024);
    expect(clawql?.boardColumns?.wakeWarmMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.wakeColdMs.p99).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.deadlineLatenessMs?.p99).toBeGreaterThanOrEqual(0);
    expect(clawql?.boardColumns?.restartSurvival).toBe(true);

    const run = evidence.clawqlRun!;
    expect(run.deadlineScheduleRetainedAtLimit).toBe(true);
    expect(run.residentAccounting.deadlineScheduleEntries).toBe(80);
    expect(run.residentAccounting.scheduleShape).toBe("deadline_min_heap");
    expect(run.residentAccounting.retainedInProcess).toMatch(/deadline/i);
    expect(run.deadlineLateness?.fired).toBeGreaterThan(0);
    expect(run.wakeOrderRepetitions).toBe(2);
    expect(run.wakeSpread).toHaveLength(2);

    const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
    expect(ont?.status).toBe("publishable");
    expect(ont?.boardColumns?.deadlineLatenessMs).toBeNull();
    expect(evidence.rows.find((r) => r.systemId === "golem")?.status).toBe("pending_invite");
  }, 300_000);
});
