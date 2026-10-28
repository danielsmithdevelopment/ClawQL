import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeDeadlineScheduleEffect, runDeadlinePumpEffect } from "./deadline-schedule.js";

describe("deadline schedule", () => {
  it("pops due entries in deadline order and records lateness", async () => {
    const schedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    const now = Date.now();
    schedule.schedule("a", now - 5);
    schedule.schedule("b", now + 30);
    schedule.schedule("c", now - 1);
    const due = schedule.popDue(now);
    expect(due.map((d) => d.agentId).sort()).toEqual(["a", "c"]);

    const pumpSchedule = await Effect.runPromise(makeDeadlineScheduleEffect());
    pumpSchedule.schedule("x", Date.now() - 2);
    pumpSchedule.schedule("y", Date.now() + 40);
    const fired: string[] = [];
    const result = await Effect.runPromise(
      runDeadlinePumpEffect({
        schedule: pumpSchedule,
        wake: async (id) => {
          fired.push(id);
        },
        maxFires: 2,
        wallDeadlineMs: Date.now() + 200,
        percentile: (samples, p) => {
          const s = [...samples].sort((a, b) => a - b);
          if (s.length === 0) return 0;
          const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
          return s[idx]!;
        },
      })
    );
    expect(fired).toContain("x");
    expect(result.fired).toBeGreaterThanOrEqual(1);
    expect(result.p99).toBeGreaterThanOrEqual(0);
  });
});
