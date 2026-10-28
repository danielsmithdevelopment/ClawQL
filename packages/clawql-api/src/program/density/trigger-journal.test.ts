import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runTriggerJournalCrashTestEffect } from "./trigger-journal-crash.js";
import { openTriggerJournalEffect, readTriggerJournalEffect } from "./trigger-journal.js";

describe("trigger journal flush policy", () => {
  it("group_commit resolves only after fsync and survives a forced flush", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tj-"));
    const journal = await Effect.runPromise(
      openTriggerJournalEffect(dir, { mode: "group_commit", batchMax: 8, flushIntervalMs: 50 })
    );
    try {
      const p = journal.record("a", 1);
      // Not yet flushed (batch < 8).
      const raced = await Promise.race([
        p.then(() => "done"),
        new Promise<"wait">((r) => setTimeout(() => r("wait"), 5)),
      ]);
      expect(raced).toBe("wait");
      await journal.flush();
      await p;
      const rows = await Effect.runPromise(readTriggerJournalEffect(journal.path));
      expect(rows).toEqual([{ agentId: "a", deadlineMs: 1 }]);
      expect(journal.policyInfo.crashSafe).toBe(true);
      expect(journal.policyInfo.mode).toBe("group_commit");
      const stats = journal.snapshotFlushStats();
      expect(stats.fsyncCount).toBeGreaterThanOrEqual(1);
      expect(stats.avgBatchSize).toBe(1);
      expect(stats.flushReasonForced).toBeGreaterThanOrEqual(1);
    } finally {
      await journal.close();
    }
  });

  it("records fsyncsPerSec and avgBatchSize under sustained group_commit load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tj-stats-"));
    const journal = await Effect.runPromise(
      openTriggerJournalEffect(dir, { mode: "group_commit", batchMax: 64, flushIntervalMs: 10 })
    );
    try {
      journal.resetFlushStats();
      const n = 64 * 40;
      // Overlap > batchMax so the next batch fills during async fsync.
      const concurrency = 128;
      for (let i = 0; i < n; i += concurrency) {
        const end = Math.min(n, i + concurrency);
        await Promise.all(
          Array.from({ length: end - i }, (_, j) => journal.record(`a${i + j}`, i + j))
        );
      }
      await journal.flush();
      const stats = journal.snapshotFlushStats();
      expect(stats.recordsFlushed).toBe(n);
      expect(stats.fsyncCount).toBeGreaterThan(10);
      expect(stats.avgBatchSize).toBeGreaterThan(1);
      expect(stats.fsyncsPerSec).toBeGreaterThan(0);
      expect(stats.avgBatchFillRatio).not.toBeNull();
      expect(stats.reading.length).toBeGreaterThan(10);
      expect(stats.flushReasonBatchFull + stats.flushReasonInterval + stats.flushReasonForced).toBe(
        stats.fsyncCount
      );
      expect(stats.doubleBuffered).toBe(true);
      expect(stats.doubleBufferHits).toBeGreaterThan(0);
    } finally {
      await journal.close();
    }
  }, 30_000);

  it("fsync_each is durable per record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tj-"));
    const journal = await Effect.runPromise(openTriggerJournalEffect(dir, { mode: "fsync_each" }));
    try {
      await journal.record("b", 2);
      const rows = await Effect.runPromise(readTriggerJournalEffect(journal.path));
      expect(rows).toHaveLength(1);
      expect(journal.policyInfo.durabilityWindowTriggers).toBe(0);
    } finally {
      await journal.close();
    }
  });

  it("os_buffer is explicitly not crash-safe", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tj-"));
    const journal = await Effect.runPromise(openTriggerJournalEffect(dir, { mode: "os_buffer" }));
    try {
      await journal.record("c", 3);
      expect(journal.policyInfo.crashSafe).toBe(false);
      expect(journal.policyInfo.syncPrimitive).toBe("none");
    } finally {
      await journal.close();
    }
  });

  it("SIGKILL crash test: every counted fire is on disk exactly once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-tj-crash-"));
    const result = await Effect.runPromise(
      runTriggerJournalCrashTestEffect({
        workDir: dir,
        policy: { mode: "group_commit", batchMax: 32, flushIntervalMs: 5 },
        total: 1_500,
        concurrency: 16,
        killAfterAcks: 300,
      })
    );
    expect(result.ok).toBe(true);
    expect(result.missingFromDisk).toBe(0);
    expect(result.duplicateOnDisk).toBe(0);
    expect(result.countedFired).toBeGreaterThanOrEqual(300);
  }, 60_000);
});
