import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  makeDeadlineScheduleEffect,
  runDeadlineAccuracyEffect,
  runDeadlinePumpEffect,
} from "./deadline-schedule.js";

describe("deadline schedule", () => {
  it("pops due entries in deadline order", async () => {
    const schedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    const now = Date.now();
    schedule.schedule("a", now - 5);
    schedule.schedule("b", now + 30);
    schedule.schedule("c", now - 1);
    const due = schedule.popDue(now);
    expect(due.map((d) => d.agentId).sort()).toEqual(["a", "c"]);
  });

  it("records scheduler tick and scores steady + burst under a shared SLA", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `bag_${i.toString(16).padStart(8, "0")}_deadbeef`);
    const fired: string[] = [];
    const report = await Effect.runPromise(
      runDeadlineAccuracyEffect({
        agentIds: ids,
        wake: async (id) => {
          fired.push(id);
        },
        horizonMs: 200,
        slaMs: 1_000,
        tickMs: 1,
        burstOffsetMs: 20,
        percentile: (samples, p) => {
          const s = [...samples].sort((a, b) => a - b);
          if (s.length === 0) return 0;
          const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
          return s[idx]!;
        },
      })
    );
    expect(report.scheduler.mechanism).toContain("setTimeout");
    expect(report.scheduler.tickMs).toBe(1);
    expect(report.steady.mode).toBe("steady");
    expect(report.burst.mode).toBe("burst");
    expect(report.steady.fired).toBe(40);
    expect(report.burst.fired).toBe(40);
    expect(report.steady.pctWithinSla).toBeGreaterThan(50);
    expect(report.burst.pctWithinSla).toBeGreaterThan(0);
    expect(report.steady.excessOverTickP99Ms).toBeGreaterThanOrEqual(0);
    expect(fired.length).toBe(80);
  }, 30_000);

  it("pump reports excess-over-tick separately from raw lateness", async () => {
    const schedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    const dueAt = Date.now() - 10;
    schedule.schedule("late", dueAt);
    const arm = await Effect.runPromise(
      runDeadlinePumpEffect({
        schedule,
        wake: async () => undefined,
        maxFires: 1,
        wallDeadlineMs: Date.now() + 100,
        tickMs: 5,
        slaMs: 1_000,
        mode: "steady",
        percentile: (samples, p) => {
          const s = [...samples].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
        },
      })
    );
    expect(arm.latenessP99Ms).toBeGreaterThanOrEqual(arm.excessOverTickP99Ms);
    expect(arm.excessOverTickP99Ms).toBeGreaterThanOrEqual(0);
  });
});
