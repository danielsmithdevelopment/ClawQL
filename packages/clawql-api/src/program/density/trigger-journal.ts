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
 * group_commit uses **async fsync/fdatasync** so the event loop can accumulate the
 * next batch while the current batch is syncing (double-buffer). A sync fsync
 * would block the loop and leave the disk idle between syncs.
 *
 * Optional `dataSync: "fdatasync"` + `preallocateBytes` are experimental arms:
 * growing append+fsync forces metadata (size/blocks) on every sync; fdatasync
 * skips unneeded metadata, and preallocated segments keep size stable.
 */

import {
  closeSync,
  fdatasync as fdatasyncCb,
  fdatasyncSync,
  fsync as fsyncCb,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { Effect } from "effect";
import { percentileMsEffect } from "./host-metrics.js";

/** Async sync so group_commit can accumulate the next batch during sync. */
const fsyncAsync = promisify(fsyncCb);
const fdatasyncAsync = promisify(fdatasyncCb);

export type TriggerFlushMode = "os_buffer" | "fsync_each" | "group_commit";

/** How group_commit persists a batch — fdatasync is an experimental arm. */
export type TriggerDataSync = "fsync" | "fdatasync";

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
      /** Default fsync. fdatasync skips metadata not required to read data back. */
      readonly dataSync?: TriggerDataSync;
      /**
       * Preallocate this many bytes and write at fixed offsets so each sync
       * does not grow the file (avoids size/allocation metadata on every sync).
       */
      readonly preallocateBytes?: number;
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
  readonly syncPrimitive: "none" | "fsync" | "fsync_group_commit" | "fdatasync_group_commit";
  readonly dataSync: TriggerDataSync | null;
  readonly preallocateBytes: number | null;
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
      dataSync: null,
      preallocateBytes: null,
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
      dataSync: "fsync",
      preallocateBytes: null,
      note: "fsync after every record before counting as fired. Durability window = 0.",
    };
  }
  const dataSync: TriggerDataSync = policy.dataSync ?? "fsync";
  const preallocateBytes = policy.preallocateBytes ?? null;
  const syncPrimitive = dataSync === "fdatasync" ? "fdatasync_group_commit" : "fsync_group_commit";
  const preNote = preallocateBytes
    ? ` Preallocated ${preallocateBytes} bytes (fixed-offset writes; size stable during segment).`
    : "";
  return {
    mode: "group_commit",
    batchMax: policy.batchMax,
    flushIntervalMs: policy.flushIntervalMs,
    // Counted fires wait for sync — unflushed batch is never counted.
    durabilityWindowTriggers: 0,
    durabilityWindowMs: 0,
    crashSafe: true,
    storage: "append_ndjson_file",
    syncPrimitive,
    dataSync,
    preallocateBytes,
    note: `Group commit: flush when batch reaches ${policy.batchMax} or every ${policy.flushIntervalMs} ms, then async ${dataSync} (double-buffer: next batch accumulates while current syncs). Fired stamps only after ${dataSync} — an unflushed batch is never counted, so a crash loses at most in-flight (not-yet-acked) work, not counted fires. Max wait for a fire ≈ flushIntervalMs (or sooner if batch fills).${preNote}`,
  };
}

export type TriggerFsyncLatencyMs = {
  readonly n: number;
  readonly mean: number | null;
  readonly p50: number | null;
  readonly p99: number | null;
};

/** Per-flush stage means — explains cycle time beyond the sync call itself. */
export type TriggerFlushCycleStagesMs = {
  readonly n: number;
  /** writeSync / positioned write of the batch. */
  readonly writeMeanMs: number | null;
  readonly writeP50Ms: number | null;
  /** fsync / fdatasync await (libuv thread-pool round-trip). */
  readonly syncMeanMs: number | null;
  readonly syncP50Ms: number | null;
  /** Resolving waiters after durable. */
  readonly ackMeanMs: number | null;
  readonly ackP50Ms: number | null;
  /** write + sync + ack for one flush. */
  readonly cycleMeanMs: number | null;
  readonly cycleP50Ms: number | null;
  /**
   * Gap from previous flush end → this flush start (batch fill / event-loop idle).
   * Large vs sync ⇒ time between syncs, not disk.
   */
  readonly interFlushGapMeanMs: number | null;
  readonly interFlushGapP50Ms: number | null;
  /** Implied fsyncs/sec if cycle alone bound the writer (1000 / cycleMeanMs). */
  readonly impliedFsyncsPerSecFromCycle: number | null;
};

export type TriggerRecordTrace = {
  readonly firedAt: number;
  readonly enqueuedAtMs: number;
  readonly flushStartedAtMs: number;
  readonly writeMs: number;
  readonly syncMs: number;
  readonly ackMs: number;
  readonly batchSize: number;
  /** enqueued → flush start (waiting for batch to fill / flush to begin). */
  readonly waitForBatchMs: number;
  /** flush start → waiter resolve (write + sync + ack share). */
  readonly waitForDurableMs: number;
};

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
  /** Per-sync wall latency — compare p50/p99 to the serial probe's mean. */
  readonly fsyncLatencyMs: TriggerFsyncLatencyMs;
  readonly dataSync: TriggerDataSync | null;
  readonly preallocateBytes: number | null;
  /**
   * Times a non-empty next batch was already pending when an fsync completed —
   * proof the writer stayed busy during sync (double-buffer working).
   */
  readonly doubleBufferHits: number;
  readonly doubleBuffered: boolean;
  /** Stage split of each flush cycle (write / sync / ack / inter-flush gap). */
  readonly cycleStagesMs: TriggerFlushCycleStagesMs;
  readonly reading: string;
};

const MAX_FSYNC_LATENCY_SAMPLES = 100_000;

function preallocateFileEffect(path: string, bytes: number): Effect.Effect<void> {
  return Effect.sync(() => {
    const viaCli = spawnSync("fallocate", ["-l", String(bytes), path], { encoding: "utf8" });
    if (viaCli.status === 0) return;
    // Fallback: extend with zeros (slower; portable).
    const fd = openSync(path, "w");
    try {
      const chunk = Buffer.alloc(Math.min(bytes, 1024 * 1024), 0);
      let left = bytes;
      while (left > 0) {
        const n = Math.min(left, chunk.length);
        writeSync(fd, chunk, 0, n);
        left -= n;
      }
    } finally {
      closeSync(fd);
    }
  });
}

export type TriggerJournal = {
  readonly path: string;
  readonly policy: TriggerFlushPolicy;
  readonly policyInfo: TriggerFlushPolicyInfo;
  /**
   * Append a trigger and resolve only after it is durable per policy.
   * Returns the wall clock at durability (use as firedAt for lateness).
   */
  readonly record: (agentId: string, deadlineMs: number) => Promise<number>;
  /** Like record, but returns enqueue/flush/sync stage timestamps for lateness splits. */
  readonly recordTraced: (agentId: string, deadlineMs: number) => Promise<TriggerRecordTrace>;
  /** Force flush of any pending batch; resolves when durable. */
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
  /** Start / restart the flush-stats window (call before a ramp arm). */
  readonly resetFlushStats: () => void;
  /** Snapshot fsyncs/sec + avg batch size since resetFlushStats (or open). */
  readonly snapshotFlushStats: () => TriggerJournalFlushStats;
};

type Waiter = {
  readonly enqueuedAtMs: number;
  readonly resolve: (trace: TriggerRecordTrace) => void;
  readonly reject: (err: unknown) => void;
};

function stageSummary(
  samples: readonly number[],
  p50: (xs: readonly number[]) => number
): { mean: number | null; p50: number | null } {
  if (samples.length === 0) return { mean: null, p50: null };
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    mean: Number((sum / samples.length).toFixed(4)),
    p50: Number(p50(samples).toFixed(4)),
  };
}

export function openTriggerJournalEffect(
  dir: string,
  policy: TriggerFlushPolicy = DEFAULT_TRIGGER_FLUSH_POLICY
): Effect.Effect<TriggerJournal> {
  return Effect.gen(function* () {
    const path = join(dir, `deadline-triggers-${process.pid}-${Date.now()}.ndjson`);
    const policyInfo = describeFlushPolicy(policy);
    const dataSync: TriggerDataSync | null =
      policy.mode === "group_commit"
        ? (policy.dataSync ?? "fsync")
        : policy.mode === "fsync_each"
          ? "fsync"
          : null;
    const preallocateBytes =
      policy.mode === "group_commit" && policy.preallocateBytes && policy.preallocateBytes > 0
        ? policy.preallocateBytes
        : null;

    if (preallocateBytes != null) {
      yield* preallocateFileEffect(path, preallocateBytes);
    }
    // Preallocated segments use positioned writes ("r+"); otherwise append.
    const fd = openSync(path, preallocateBytes != null ? "r+" : "a");
    let writeOffset = 0;

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
    const fsyncLatencySamples: number[] = [];
    const writeStageSamples: number[] = [];
    const syncStageSamples: number[] = [];
    const ackStageSamples: number[] = [];
    const cycleStageSamples: number[] = [];
    const interFlushGapSamples: number[] = [];
    let lastFlushEndNs: bigint | null = null;
    const doubleBuffered = policy.mode === "group_commit";
    const p50Of = (xs: readonly number[]) => Effect.runSync(percentileMsEffect(xs, 50));

    const noteSyncLatency = (ms: number) => {
      fsyncWaitMsTotal += ms;
      fsyncCount += 1;
      if (fsyncLatencySamples.length < MAX_FSYNC_LATENCY_SAMPLES) {
        fsyncLatencySamples.push(ms);
      }
    };

    const noteStage = (bucket: number[], ms: number) => {
      if (bucket.length < MAX_FSYNC_LATENCY_SAMPLES) bucket.push(ms);
    };

    const syncFdAsync = async (): Promise<void> => {
      if (dataSync === "fdatasync") await fdatasyncAsync(fd);
      else await fsyncAsync(fd);
    };

    const syncFdSync = (): void => {
      if (dataSync === "fdatasync") fdatasyncSync(fd);
      else fsyncSync(fd);
    };

    const writePayload = (payload: string | Buffer): void => {
      const buf = typeof payload === "string" ? Buffer.from(payload) : payload;
      if (preallocateBytes != null) {
        if (writeOffset + buf.length > preallocateBytes) {
          throw new Error(
            `trigger journal preallocate exhausted (${writeOffset + buf.length} > ${preallocateBytes})`
          );
        }
        writeSync(fd, buf, 0, buf.length, writeOffset);
        writeOffset += buf.length;
      } else {
        writeSync(fd, buf);
      }
    };

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
      fsyncLatencySamples.length = 0;
      writeStageSamples.length = 0;
      syncStageSamples.length = 0;
      ackStageSamples.length = 0;
      cycleStageSamples.length = 0;
      interFlushGapSamples.length = 0;
      lastFlushEndNs = null;
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
      const fsyncLatencyMs: TriggerFsyncLatencyMs =
        fsyncLatencySamples.length === 0
          ? { n: 0, mean: null, p50: null, p99: null }
          : {
              n: fsyncLatencySamples.length,
              mean: fsyncWaitMsMean,
              p50: Number(Effect.runSync(percentileMsEffect(fsyncLatencySamples, 50)).toFixed(4)),
              p99: Number(Effect.runSync(percentileMsEffect(fsyncLatencySamples, 99)).toFixed(4)),
            };
      const writeS = stageSummary(writeStageSamples, p50Of);
      const syncS = stageSummary(syncStageSamples, p50Of);
      const ackS = stageSummary(ackStageSamples, p50Of);
      const cycleS = stageSummary(cycleStageSamples, p50Of);
      const gapS = stageSummary(interFlushGapSamples, p50Of);
      const cycleStagesMs: TriggerFlushCycleStagesMs = {
        n: cycleStageSamples.length,
        writeMeanMs: writeS.mean,
        writeP50Ms: writeS.p50,
        syncMeanMs: syncS.mean,
        syncP50Ms: syncS.p50,
        ackMeanMs: ackS.mean,
        ackP50Ms: ackS.p50,
        cycleMeanMs: cycleS.mean,
        cycleP50Ms: cycleS.p50,
        interFlushGapMeanMs: gapS.mean,
        interFlushGapP50Ms: gapS.p50,
        impliedFsyncsPerSecFromCycle:
          cycleS.mean != null && cycleS.mean > 0 ? Number((1000 / cycleS.mean).toFixed(1)) : null,
      };

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
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax} (near full); doubleBufferHits=${doubleBufferHits}/${fsyncCount}; fsyncsPerSec=${fsyncsPerSec}; cycle p50=${cycleStagesMs.cycleP50Ms}ms (write=${cycleStagesMs.writeP50Ms} sync=${cycleStagesMs.syncP50Ms} ack=${cycleStagesMs.ackP50Ms} gap=${cycleStagesMs.interFlushGapP50Ms}).`;
      } else {
        reading = `avgBatchSize ${avgBatchSize.toFixed(1)}/${batchMax ?? "?"}; fsyncsPerSec=${fsyncsPerSec}; doubleBufferHits=${doubleBufferHits}; syncLatency p50=${fsyncLatencyMs.p50}ms.`;
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
        fsyncLatencyMs,
        dataSync,
        preallocateBytes,
        doubleBufferHits,
        doubleBuffered,
        cycleStagesMs,
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
          const flushStartedAtMs = Date.now();
          const cycleT0 = process.hrtime.bigint();
          if (lastFlushEndNs != null) {
            noteStage(interFlushGapSamples, Number(cycleT0 - lastFlushEndNs) / 1e6);
          }
          try {
            const writeT0 = process.hrtime.bigint();
            writePayload(lines.join(""));
            const writeMs = Number(process.hrtime.bigint() - writeT0) / 1e6;
            noteStage(writeStageSamples, writeMs);

            let syncMs = 0;
            if (policy.mode !== "os_buffer") {
              const syncT0 = process.hrtime.bigint();
              // Async sync: event loop can accept the next batch while this syncs.
              await syncFdAsync();
              syncMs = Number(process.hrtime.bigint() - syncT0) / 1e6;
              noteSyncLatency(syncMs);
              noteStage(syncStageSamples, syncMs);
              if (pendingLines.length > 0) doubleBufferHits += 1;
            }
            batchSizeSum += lines.length;
            recordsFlushed += lines.length;
            if (reason === "batch_full") flushReasonBatchFull += 1;
            else if (reason === "interval") flushReasonInterval += 1;
            else flushReasonForced += 1;

            const ackT0 = process.hrtime.bigint();
            const firedAt = Date.now();
            for (const w of batchWaiters) {
              w.resolve({
                firedAt,
                enqueuedAtMs: w.enqueuedAtMs,
                flushStartedAtMs,
                writeMs,
                syncMs,
                ackMs: 0,
                batchSize: lines.length,
                waitForBatchMs: Math.max(0, flushStartedAtMs - w.enqueuedAtMs),
                waitForDurableMs: Math.max(0, firedAt - flushStartedAtMs),
              });
            }
            const ackMs = Number(process.hrtime.bigint() - ackT0) / 1e6;
            noteStage(ackStageSamples, ackMs);
            const cycleMs = Number(process.hrtime.bigint() - cycleT0) / 1e6;
            noteStage(cycleStageSamples, cycleMs);
            lastFlushEndNs = process.hrtime.bigint();
          } catch (err) {
            for (const w of batchWaiters) w.reject(err);
            throw err;
          }
          // Loop if more arrived during async sync (double-buffer hit).
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

    const enqueueGroupCommit = (
      agentId: string,
      deadlineMs: number
    ): Promise<TriggerRecordTrace> => {
      const line = `${JSON.stringify({ agentId, deadlineMs })}\n`;
      return new Promise<TriggerRecordTrace>((resolve, reject) => {
        pendingLines.push(line);
        waiters.push({ enqueuedAtMs: Date.now(), resolve, reject });
        const batchMax = policy.mode === "group_commit" ? policy.batchMax : 1;
        if (pendingLines.length >= batchMax) {
          pendingFlushReason = "batch_full";
          void flushNow();
        } else {
          armInterval();
        }
      });
    };

    const recordTraced = async (
      agentId: string,
      deadlineMs: number
    ): Promise<TriggerRecordTrace> => {
      if (closed) throw new Error("trigger journal closed");
      if (policy.mode === "os_buffer") {
        const enqueuedAtMs = Date.now();
        writePayload(`${JSON.stringify({ agentId, deadlineMs })}\n`);
        const firedAt = Date.now();
        return {
          firedAt,
          enqueuedAtMs,
          flushStartedAtMs: enqueuedAtMs,
          writeMs: 0,
          syncMs: 0,
          ackMs: 0,
          batchSize: 1,
          waitForBatchMs: 0,
          waitForDurableMs: Math.max(0, firedAt - enqueuedAtMs),
        };
      }
      if (policy.mode === "fsync_each") {
        const enqueuedAtMs = Date.now();
        const flushStartedAtMs = enqueuedAtMs;
        const writeT0 = process.hrtime.bigint();
        writePayload(`${JSON.stringify({ agentId, deadlineMs })}\n`);
        const writeMs = Number(process.hrtime.bigint() - writeT0) / 1e6;
        const syncT0 = process.hrtime.bigint();
        syncFdSync();
        const syncMs = Number(process.hrtime.bigint() - syncT0) / 1e6;
        noteSyncLatency(syncMs);
        noteStage(writeStageSamples, writeMs);
        noteStage(syncStageSamples, syncMs);
        batchSizeSum += 1;
        recordsFlushed += 1;
        flushReasonForced += 1;
        const firedAt = Date.now();
        return {
          firedAt,
          enqueuedAtMs,
          flushStartedAtMs,
          writeMs,
          syncMs,
          ackMs: 0,
          batchSize: 1,
          waitForBatchMs: 0,
          waitForDurableMs: Math.max(0, firedAt - flushStartedAtMs),
        };
      }
      return enqueueGroupCommit(agentId, deadlineMs);
    };

    const record = async (agentId: string, deadlineMs: number): Promise<number> => {
      const trace = await recordTraced(agentId, deadlineMs);
      return trace.firedAt;
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
      recordTraced,
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
    let raw: string;
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
