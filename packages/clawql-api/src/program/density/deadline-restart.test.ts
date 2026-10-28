import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runDeadlineRestartTestEffect } from "./deadline-restart.js";
import {
  rebuildDeadlineScheduleFromSnapshotEffect,
  writeDeadlineScheduleSnapshotEffect,
} from "./deadline-schedule-store.js";

const pct = (samples: readonly number[], p: number): number => {
  const s = [...samples].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
};

describe("deadline schedule store + restart", () => {
  it("round-trips a snapshot and rebuilds pads + live entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-sched-store-"));
    const now = Date.now();
    const live = [
      { agentId: "a", deadlineMs: now + 10 },
      { agentId: "b", deadlineMs: now + 20 },
    ];
    const snap = await Effect.runPromise(
      writeDeadlineScheduleSnapshotEffect({
        dir,
        capacity: 1_000,
        live,
        padCount: 998,
        farDeadlineMs: now + 3_600_000,
        writtenAtMs: now,
      })
    );
    const rebuilt = await Effect.runPromise(rebuildDeadlineScheduleFromSnapshotEffect(snap.path));
    expect(rebuilt.header.liveCount).toBe(2);
    expect(rebuilt.header.padCount).toBe(998);
    expect(rebuilt.schedule.size()).toBe(1_000);
    expect(rebuilt.rebuildMs).toBeGreaterThanOrEqual(0);
  });

  it("SIGKILL restart: rebuild, no loss/duplicates, prompt overdue catch-up", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-deadline-restart-"));
    const result = await Effect.runPromise(
      runDeadlineRestartTestEffect({
        workDir: dir,
        capacity: 5_000,
        liveCount: 80,
        downtimeMs: 300,
        policy: { mode: "group_commit", batchMax: 32, flushIntervalMs: 5 },
        concurrency: 32,
        catchUpSlaMs: 1_000,
        percentile: pct,
      })
    );
    expect(result.ok).toBe(true);
    expect(result.missingLive).toBe(0);
    expect(result.duplicateFired).toBe(0);
    expect(result.overdueFired).toBe(result.overdueExpected);
    expect(result.overdueExpected).toBeGreaterThan(0);
    expect(result.rebuildMs).toBeGreaterThanOrEqual(0);
    expect(result.overdueCatchUp?.pctWithinSla).toBeGreaterThanOrEqual(99);
  }, 120_000);
});
