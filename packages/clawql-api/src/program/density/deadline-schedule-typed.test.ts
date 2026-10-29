import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeTypedDeadlineScheduleEffect } from "./deadline-schedule-typed.js";
import { padResidentHeap } from "./deadline-schedule.js";

describe("typed deadline schedule", () => {
  it("pads without creating per-entry agent id map entries", async () => {
    const schedule = await Effect.runPromise(makeTypedDeadlineScheduleEffect(10_000));
    const now = Date.now();
    schedule.schedule("real_a", now - 5);
    schedule.schedulePad(5_000, now + 60_000);
    expect(schedule.size()).toBe(5_001);
    expect(schedule.shape).toBe("typed_arrays");
    const due = schedule.popDue(now);
    expect(due.map((d) => d.agentId)).toEqual(["real_a"]);
    expect(schedule.peekDeadlineMs()).toBeGreaterThan(now);
  });

  it("padResidentHeap uses schedulePad when available", async () => {
    const schedule = await Effect.runPromise(makeTypedDeadlineScheduleEffect(100_000));
    padResidentHeap(schedule, 50_000, Date.now() + 3_600_000);
    expect(schedule.size()).toBe(50_000);
  });
});
