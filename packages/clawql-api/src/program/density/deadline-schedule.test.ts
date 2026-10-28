import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  makeDeadlineScheduleEffect,
  openTriggerJournalEffect,
  rampSustainableRateEffect,
  runDeadlineAccuracyEffect,
  runDeadlinePumpEffect,
} from "./deadline-schedule.js";

const pct = (samples: readonly number[], p: number): number => {
  const s = [...samples].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
};

describe("deadline schedule", () => {
  it("pops due entries via O(log n) heap in deadline order", async () => {
    const schedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    const now = Date.now();
    schedule.schedule("a", now - 5);
    schedule.schedule("b", now + 30);
    schedule.schedule("c", now - 1);
    const due = schedule.popDue(now);
    expect(due.map((d) => d.agentId).sort()).toEqual(["a", "c"]);
    expect(schedule.peekDeadlineMs()).toBe(now + 30);
  });

  it("records durable fires after group_commit flush with arrival rate + ramp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-deadline-"));
    const journal = await Effect.runPromise(
      openTriggerJournalEffect(dir, { mode: "group_commit", batchMax: 16, flushIntervalMs: 5 })
    );
    const ids = Array.from(
      { length: 40 },
      (_, i) => `bag_${i.toString(16).padStart(8, "0")}_deadbeef`
    );
    const fired: string[] = [];
    try {
      const report = await Effect.runPromise(
        runDeadlineAccuracyEffect({
          agentIds: ids,
          fire: async (entry) => {
            await journal.record(entry.agentId, entry.deadlineMs);
            fired.push(entry.agentId);
          },
          horizonMs: 200,
          slaMs: 1_000,
          tickMs: 1,
          concurrency: 16,
          burstOffsetMs: 20,
          firedDefinition: "durable_trigger_record",
          flushPolicy: { mode: "group_commit", batchMax: 16, flushIntervalMs: 5 },
          skipRamp: false,
          rampWindowMs: 400,
          rampRatesPerSec: [50, 100, 250],
          percentile: pct,
        })
      );
      expect(report.scheduler.mechanism).toContain("setTimeout");
      expect(report.scheduler.nextDeadlineComplexity).toMatch(/O\(log n\)/);
      expect(report.scheduler.flushPolicy?.mode).toBe("group_commit");
      expect(report.scheduler.flushPolicy?.crashSafe).toBe(true);
      expect(report.scheduler.firedDefinition).toBe("durable_trigger_record");
      expect(report.steady.fired).toBe(40);
      expect(report.burst.fired).toBe(40);
      expect(report.steady.arrivalRatePerSec).toBeGreaterThan(0);
      expect(report.sustainablePerSec).toBeGreaterThan(0);
      expect(fired.length).toBeGreaterThanOrEqual(80);
      const body = await readFile(journal.path, "utf8");
      expect(body.trim().split("\n").length).toBeGreaterThanOrEqual(80);
    } finally {
      await journal.close();
    }
  }, 30_000);

  it("pump reports excess-over-tick separately from raw lateness", async () => {
    const schedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    const dueAt = Date.now() - 10;
    schedule.schedule("late", dueAt);
    const arm = await Effect.runPromise(
      runDeadlinePumpEffect({
        schedule,
        fire: async () => undefined,
        maxFires: 1,
        wallDeadlineMs: Date.now() + 100,
        tickMs: 5,
        slaMs: 1_000,
        mode: "steady",
        arrivalRatePerSec: 1,
        concurrency: 8,
        percentile: pct,
      })
    );
    expect(arm.latenessP99Ms).toBeGreaterThanOrEqual(arm.excessOverTickP99Ms);
    expect(arm.excessOverTickP99Ms).toBeGreaterThanOrEqual(0);
  });

  it("ramp stops after first rate below the SLA target", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id_${i}`);
    let calls = 0;
    const { sustainablePerSec, ramp } = await Effect.runPromise(
      rampSustainableRateEffect({
        agentIds: ids,
        fire: async () => {
          calls += 1;
          await new Promise<void>((r) => setTimeout(r, 5));
        },
        windowMs: 500,
        slaMs: 50,
        slaTargetPct: 99,
        concurrency: 4,
        ratesPerSec: [20, 40, 200],
        percentile: pct,
      })
    );
    expect(ramp.length).toBeGreaterThanOrEqual(1);
    expect(ramp.length).toBeLessThanOrEqual(3);
    expect(sustainablePerSec).toBeGreaterThanOrEqual(0);
    expect(calls).toBeGreaterThan(0);
  }, 30_000);
});
