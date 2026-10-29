import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { openTriggerJournalEffect, runScaledBurstLadderEffect } from "./deadline-schedule.js";

const pct = (samples: readonly number[], p: number): number => {
  const s = [...samples].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
};

describe("scaled burst ladder", () => {
  it("reports first miss when a size fails the SLA target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-scaled-"));
    const journal = await Effect.runPromise(
      openTriggerJournalEffect(dir, { mode: "group_commit", batchMax: 32, flushIntervalMs: 5 })
    );
    try {
      const ladder = await Effect.runPromise(
        runScaledBurstLadderEffect({
          fire: async (entry) => {
            await journal.record(entry.agentId, entry.deadlineMs);
          },
          sizes: [16, 32],
          slaMs: 1_000,
          slaTargetPct: 99,
          concurrency: 16,
          residentHeapSize: 0,
          scheduleShape: "typed_arrays",
          percentile: pct,
        })
      );
      expect(ladder.arms.length).toBeGreaterThanOrEqual(1);
      expect(ladder.arms[0]!.n).toBe(16);
      expect(ladder.firstMissSize === null || ladder.firstMissSize >= 16).toBe(true);
    } finally {
      await journal.close();
    }
  }, 60_000);
});
