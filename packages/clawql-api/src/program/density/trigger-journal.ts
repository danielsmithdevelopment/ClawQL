/**
 * Append-only trigger journal with an explicit flush policy.
 *
 * "Fired" for the durable_trigger_record definition means the record has been
 * flushed per this policy — not merely write(2)'d into the OS page cache.
 *
 * Policies:
 * - os_buffer: writeSync only (diagnostic; not crash-durable)
 * - fsync_each: fsync after every record (durability window = 0)
 * - group_commit: batch by size and/or interval, then one fsync (group commit)
 *
 * group_commit uses **async fsync** so the event loop can accumulate the next
 * batch while the current batch is syncing (double-buffer). A sync fsync would
 * block the loop and leave the disk idle between syncs.
 */

import { closeSync, fsync as fsyncCb, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import { Effect } from "effect";

/** Async fsync so group_commit can accumulate the next batch during sync. */
const fsyncAsync = promisify(fsyncCb);

export type TriggerFlushMode = "os_buffer" | "fsync_each" | "group_commit";

export type TriggerFlushPolicy =
  | {
      readonly mode: "os_buffer";
    }
  | {
      readonly mode: "fsync_each";
    }
  | {
      readonly mode: "group_commit";
      readonly batchMax: number;
      readonly flushIntervalMs: number;
    };

/** Board default: group commit (legitimate DB-style durability). */
export const DEFAULT_TRIGGER_FLUSH_POLICY: TriggerFlushPolicy = {
  mode: "group_commit",
  batchMax: 64,
  flushIntervalMs: 10,
};

export type TriggerFlushPolicyInfo = {
  readonly mode: TriggerFlushMode;
  readonly batchMax: number | null;
  readonly flushIntervalMs: number | null;
  /** Max triggers that can be lost on crash after being counted as fired. */
  readonly durabilityWindowTriggers: number | null;
  /** Max wall time a counted fire may still be only in an unflushed batch. */
  readonly durabilityWindowMs: number | null;
  readonly crashSafe: boolean;
  readonly storage: "append_ndjson_file";
  readonly syncPrimitive: "none" | "fsync" | "fsync_group_commit";
  readonly note: string;
};

export function describeFlushPolicy(policy: TriggerFlushPolicy): TriggerFlushPolicyInfo {
  if (policy.mode === "os_buffer") {
    return {
      mode: "os_buffer",
      batchMax: null,
      flushIntervalMs: null,
      durabilityWindowTriggers: null,
      durabilityWindowMs: null,
      crashSafe: false,
      storage: "append_ndjson_file",
      syncPrimitive: "none",
      note: "writeSync into the OS page cache only — NOT crash-durable. Throughput here is a buffer write rate, not durable trigger throughput. Do not publish as durable.",
    };
  }
  if (policy.mode === "fsync_each") {
    return {
      mode: "fsync_each",
      batchMax: 1,
      flushIntervalMs: 0,
      durabilityWindowTriggers: 0,
      durabilityWindowMs: 0,
      crashSafe: true,
      storage: "append_ndjson_file",
      syncPrimitive: "fsync",
      note: "fsync after every record before counting as fired. Durability window = 0.",
    };
  }
  return {
    mode: "group_commit",
    batchMax: policy.batchMax,
    flushIntervalMs: policy.flushIntervalMs,
    // Counted fires wait for fsync — unflushed batch is never counted.
    durabilityWindowTriggers: 0,
    durabilityWindowMs: 0,
    crashSafe: true,
    storage: "append_ndjson_file",
    syncPrimitive: "fsync_group_commit",
    note: `Group commit: flush when batch reaches ${policy.batchMax} or every ${policy.flushIntervalMs} ms, then async fsync (double-buffer: next batch accumulates while current syncs). Fired stamps only after fsync — an unflushed batch is never counted, so a crash loses at most in-flight (not-yet-acked) work, not counted fires. Max wait for a fire ≈ flushIntervalMs (or sooner if batch fills).`,
  };
}

/**
 * Runtime flush accounting for group_commit — explains fraction-of-serial-ceiling.
 *
 * - fsyncsPerSec near the serial ceiling + avgBatchSize ≪ batchMax ⇒ early flush
 *   (timer / empty queue), disk busy but batches half-full.
 * - fsyncsPerSec well below the serial ceiling + avgBatchSize near batchMax ⇒
 *   writer idle between syncs (likely waits for fsync before building the next
 *   batch; double-buffering is the usual fix).
 */
export type TriggerJournalFlushStats = {
  readonly windowMs: number;
  readonly fsyncCount: number;
  readonly recordsFlushed: number;
  readonly avgBatchSize: number;
  readonly fsyncsPerSec: number;
  readonly recordsPerSec: number;
  readonly batchMax: number | null;
  readonly avgBatchFillRatio: number | null;
  readonly flushReasonBatchFull: number;
  readonly flushReasonInterval: number;
  readonly flushReasonForced: number;
  readonly fsyncWaitMsTotal: number;
  readonly fsyncWaitMsMean: number | null;
  /**
   * Times a non-empty next batch was already pending when an fsync completed —
   * proof the writer stayed busy during sync (double-buffer working).
   */
  readonly doubleBufferHits: number;
  readonly doubleBuffered: boolean;
  readonly reading: string;
};

export type TriggerJournal = {
  readonly path: string;
  readonly policy: TriggerFlushPolicy;
  readonly policyInfo: TriggerFlushPolicyInfo;
  /**
   * Append a trigger and resolve only after it is durable per policy.
   * Returns the wall clock at durability (use as firedAt for lateness).
   */
  readonly record: (agentId: string, deadlineMs: number) => Promise<number>;
  /** Force flush of any pending batch; resolves when durable. */
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
  /** Start / restart the flush-stats window (call before a ramp arm). */
  readonly resetFlushStats: () => void;
  /** Snapshot fsyncs/sec + avg batch size since resetFlushStats (or open). */
  readonly snapshotFlushStats: () => TriggerJournalFlushStats;
};

type Waiter = {
  readonly resolve: (firedAt: number) => void;
  readonly reject: (err: unknown) => void;
};

export function openTriggerJournalEffect(
  dir: string,
  policy: TriggerFlushPolicy = DEFAULT_TRIGGER_FLUSH_POLICY
): Effect.Effect<TriggerJournal> {
  return Effect.sync(() => {
    const path = join(dir, `deadline-triggers-${process.pid}-${Date.now()}.ndjson`);
    const fd = openSync(path, "a");
    const policyInfo = describeFlushPolicy(policy);

    let pendingLines: string[] = [];
    let waiters: Waiter[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let flushing: Promise<void> | null = null;
    /** Why the next flushNow invocation was scheduled. */
    let pendingFlushReason: "batch_full" | "interval" | "forced" = "forced";

    let statsWindowStartNs = process.hrtime.bigint();
    let fsyncCount = 0;
    let recordsFlushed = 0;
    let batchSizeSum = 0;
    let flushReasonBatchFull = 0;
    let flushReasonInterval = 0;
    let flushReasonForced = 0;
    let fsyncWaitMsTotal = 0;
    let doubleBufferHits = 0;
    const doubleBuffered = policy.mode === "group_commit";

    const resetFlushStats = () => {
      statsWindowStartNs = process.hrtime.bigint();
      fsyncCount = 0;
      recordsFlushed = 0;
      batchSizeSum = 0;
      flushReasonBatchFull = 0;
      flushReasonInterval = 0;
      flushReasonForced = 0;
      fsyncWaitMsTotal = 0;
      doubleBufferHits = 0;
    };

    const snapshotFlushStats = (): TriggerJournalFlushStats => {
      const windowMs = Math.max(1, Number(process.hrtime.bigint() - statsWindowStartNs) / 1e6);
      const windowSec = windowMs / 1000;
      const avgBatchSize = fsyncCount > 0 ? batchSizeSum / fsyncCount : 0;
      const batchMax =
        policy.mode === "group_commit" ? policy.batchMax : policy.mode === "fsync_each" ? 1 : null;
      const avgBatchFillRatio =
        batchMax && batchMax > 0 ? Number((avgBatchSize / batchMax).toFixed(4)) : null;
      const fsyncsPerSec = Number((fsyncCount / windowSec).toFixed(2));
      const recordsPerSec = Number((recordsFlushed / windowSec).toFixed(2));
      const fsyncWaitMsMean =
        fsyncCount > 0 ? Number((fsyncWaitMsTotal / fsyncCount).toFixed(4)) : null;

      let reading: string;
      if (fsyncCount === 0) {
        reading = "No fsyncs in window.";
      } else if (avgBatchFillRatio !== null && avgBatchFillRatio < 0.75) {
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax} (fill ${(avgBatchFillRatio * 100).toFixed(0)}%) — batches flushing early (10ms timer or queue empty). Compare fsyncsPerSec=${fsyncsPerSec} to the serial fsync ceiling; near ceiling ⇒ disk busy, batches half-full.`;
      } else if (
        avgBatchFillRatio !== null &&
        avgBatchFillRatio >= 0.9 &&
        doubleBufferHits === 0 &&
        doubleBuffered
      ) {
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax} (near full) but doubleBufferHits=0 — next batch was not ready when fsync returned (producer starvation or sync still blocking).`;
      } else if (avgBatchFillRatio !== null && avgBatchFillRatio >= 0.9) {
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax} (near full); doubleBufferHits=${doubleBufferHits}/${fsyncCount}; fsyncsPerSec=${fsyncsPerSec}. Compare fsyncsPerSec to the serial ceiling — near ceiling ⇒ disk-bound under double-buffer.`;
      } else {
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax ?? "?"}; fsyncsPerSec=${fsyncsPerSec}; doubleBufferHits=${doubleBufferHits}. Compare both to serial ceiling × batchMax.`;
      }

      return {
        windowMs: Number(windowMs.toFixed(2)),
        fsyncCount,
        recordsFlushed,
        avgBatchSize: Number(avgBatchSize.toFixed(3)),
        fsyncsPerSec,
        recordsPerSec,
        batchMax,
        avgBatchFillRatio,
        flushReasonBatchFull,
        flushReasonInterval,
        flushReasonForced,
        fsyncWaitMsTotal: Number(fsyncWaitMsTotal.toFixed(3)),
        fsyncWaitMsMean,
        doubleBufferHits,
        doubleBuffered,
        reading,
      };
    };

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const armInterval = () => {
      if (policy.mode !== "group_commit" || timer || closed || pendingLines.length === 0) return;
      // Do NOT unref — pending waiters must keep the event loop alive until flush.
      timer = setTimeout(() => {
        timer = null;
        pendingFlushReason = "interval";
        void flushNow();
      }, policy.flushIntervalMs);
    };

    const flushNow = (): Promise<void> => {
      if (flushing) return flushing;
      flushing = (async () => {
        for (;;) {
          if (pendingLines.length === 0) return;
          const lines = pendingLines;
          const batchWaiters = waiters;
          const reason = pendingFlushReason;
          pendingFlushReason = "forced";
          pendingLines = [];
          waiters = [];
          clearTimer();
          try {
            writeSync(fd, lines.join(""));
            if (policy.mode !== "os_buffer") {
              const t0 = process.hrtime.bigint();
              // Async fsync: event loop can accept the next batch while this syncs.
              await fsyncAsync(fd);
              fsyncWaitMsTotal += Number(process.hrtime.bigint() - t0) / 1e6;
              fsyncCount += 1;
              if (pendingLines.length > 0) doubleBufferHits += 1;
            }
            batchSizeSum += lines.length;
            recordsFlushed += lines.length;
            if (reason === "batch_full") flushReasonBatchFull += 1;
            else if (reason === "interval") flushReasonInterval += 1;
            else flushReasonForced += 1;
            const firedAt = Date.now();
            for (const w of batchWaiters) w.resolve(firedAt);
          } catch (err) {
            for (const w of batchWaiters) w.reject(err);
            throw err;
          }
          // Loop if more arrived during async fsync (double-buffer hit).
          if (pendingLines.length === 0) return;
          if (policy.mode === "group_commit" && pendingLines.length < policy.batchMax) {
            armInterval();
            return;
          }
          // Full batch already waiting — continue drain without waiting for timer.
          pendingFlushReason = "batch_full";
        }
      })().finally(() => {
        flushing = null;
      });
      return flushing;
    };

    const record = (agentId: string, deadlineMs: number): Promise<number> => {
      if (closed) return Promise.reject(new Error("trigger journal closed"));
      const line = `${JSON.stringify({ agentId, deadlineMs })}\n`;

      if (policy.mode === "os_buffer") {
        writeSync(fd, line);
        return Promise.resolve(Date.now());
      }

      if (policy.mode === "fsync_each") {
        const t0 = process.hrtime.bigint();
        writeSync(fd, line);
        fsyncSync(fd);
        fsyncWaitMsTotal += Number(process.hrtime.bigint() - t0) / 1e6;
        fsyncCount += 1;
        batchSizeSum += 1;
        recordsFlushed += 1;
        flushReasonForced += 1;
        return Promise.resolve(Date.now());
      }

      return new Promise<number>((resolve, reject) => {
        pendingLines.push(line);
        waiters.push({ resolve, reject });
        if (pendingLines.length >= policy.batchMax) {
          pendingFlushReason = "batch_full";
          void flushNow();
        } else {
          armInterval();
        }
      });
    };

    const flush = async (): Promise<void> => {
      pendingFlushReason = "forced";
      await flushNow();
    };

    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      clearTimer();
      pendingFlushReason = "forced";
      await flushNow();
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    };

    return {
      path,
      policy,
      policyInfo,
      record,
      flush,
      close,
      resetFlushStats,
      snapshotFlushStats,
    };
  });
}

export type TriggerJournalLine = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

/** Parse a journal file; skips a trailing partial line (crash mid-write). */
export function readTriggerJournalEffect(
  path: string
): Effect.Effect<readonly TriggerJournalLine[]> {
  return Effect.sync(() => {
    let raw = "";
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return [];
    }
    const out: TriggerJournalLine[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line) as { agentId?: unknown; deadlineMs?: unknown };
        if (typeof o.agentId === "string" && typeof o.deadlineMs === "number") {
          out.push({ agentId: o.agentId, deadlineMs: o.deadlineMs });
        }
      } catch {
        // Truncated last line after crash — ignore.
      }
    }
    return out;
  });
}
