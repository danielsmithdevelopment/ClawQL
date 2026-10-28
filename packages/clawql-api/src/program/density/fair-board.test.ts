import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FAIR_CONTRACT_ID } from "./types.js";
import { runFairDensityBoardEffect } from "./fair-board.js";

describe("fair density board (smoke)", () => {
  it("retains deadline schedule and scores steady+burst SLA accuracy", async () => {
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
        deadlineSlaMs: 1_000,
        deadlineConcurrency: 32,
        deadlineFiredDefinition: "durable_trigger_record",
        skipDeadlineRamp: false,
        deadlineRampRatesPerSec: [50, 100, 250],
        rssCeilingMiB: 512,
        continueUntilCeiling: false,
        skipCold: false,
        skipRestart: false,
        hostLabel: "vitest-smoke",
      })
    );

    expect(evidence.kind).toBe(FAIR_CONTRACT_ID);
    expect(evidence.contract.definitions.retainedAtLimit).toBe("wake_deadline_schedule");

    const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
    expect(clawql?.status).toBe("methodology_pending");
    expect(clawql?.boardColumns?.agentsAtLimit).toBe(80);
    expect(clawql?.boardColumns?.deadlineAccuracy?.slaMs).toBe(1_000);
    expect(clawql?.boardColumns?.deadlineAccuracy?.firedDefinition).toBe(
      "durable_trigger_record"
    );
    expect(clawql?.boardColumns?.deadlineAccuracy?.concurrency).toBe(32);
    expect(clawql?.boardColumns?.deadlineAccuracy?.steadyArrivalRatePerSec).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.deadlineAccuracy?.steadyPctMet).toBeGreaterThan(0);
    expect(clawql?.boardColumns?.deadlineAccuracy?.burstPctMet).toBeGreaterThanOrEqual(0);
    expect(clawql?.boardColumns?.deadlineAccuracy?.sustainablePerSec).toBeGreaterThanOrEqual(0);
    expect(clawql?.boardColumns?.restartSurvival).toBe(true);

    const run = evidence.clawqlRun!;
    expect(run.deadlineScheduleRetainedAtLimit).toBe(true);
    expect(run.residentAccounting.deadlineScheduleEntries).toBe(80);
    expect(run.deadlineAccuracy?.scheduler.tickMs).toBeGreaterThan(0);
    expect(run.deadlineAccuracy?.scheduler.mechanism).toMatch(/setTimeout/i);
    expect(run.deadlineAccuracy?.scheduler.nextDeadlineComplexity).toMatch(/O\(log n\)/);
    expect(run.deadlineAccuracy?.scheduler.firedDefinition).toBe("durable_trigger_record");
    expect(run.deadlineAccuracy?.steady.mode).toBe("steady");
    expect(run.deadlineAccuracy?.burst.mode).toBe("burst");
    expect(run.deadlineAccuracy?.steady.fired).toBeGreaterThan(0);
    expect(run.deadlineAccuracy?.burst.fired).toBeGreaterThan(0);
    expect(run.deadlineAccuracy?.steady.arrivalRatePerSec).toBeGreaterThan(0);
    expect(typeof run.deadlineAccuracy?.sustainablePerSec).toBe("number");
    expect(Array.isArray(run.deadlineAccuracy?.ramp)).toBe(true);

    const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
    expect(ont?.boardColumns?.deadlineAccuracy).toBeNull();
  }, 300_000);
});
