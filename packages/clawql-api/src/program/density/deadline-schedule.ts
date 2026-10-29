/**
 * In-memory wake-deadline schedule for fair parked agents.
 *
 * Next-deadline selection is an O(log n) binary min-heap (not a linear scan).
 * "Fired" for the board SLA means a **durable trigger record** was flushed
 * per an explicit flush policy (approval-expiry semantics) — not bag load.
 *
 * Steady arms declare an **arrival rate** (deadlines/sec). The comparable
 * headline is the max rate that still meets ≥99% within the shared 1s SLA,
 * under the same fired definition + flush policy.
 */

import { PerformanceObserver } from "node:perf_hooks";
import { Effect } from "effect";
import { makeTypedDeadlineScheduleEffect } from "./deadline-schedule-typed.js";
import {
  DEFAULT_TRIGGER_FLUSH_POLICY,
  describeFlushPolicy,
  type TriggerFlushPolicy,
  type TriggerFlushPolicyInfo,
} from "./trigger-journal.js";

export type { TriggerFlushPolicy, TriggerFlushPolicyInfo } from "./trigger-journal.js";
export {
  DEFAULT_TRIGGER_FLUSH_POLICY,
  describeFlushPolicy,
  openTriggerJournalEffect,
  readTriggerJournalEffect,
} from "./trigger-journal.js";
export { makeTypedDeadlineScheduleEffect } from "./deadline-schedule-typed.js";
export type { TypedDeadlineSchedule } from "./deadline-schedule-typed.js";

export type DeadlineEntry = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

export type DeadlineScheduleShape = "object_entries" | "typed_arrays";

export type DeadlineSchedule = {
  readonly shape?: DeadlineScheduleShape;
  readonly size: () => number;
  readonly schedule: (agentId: string, deadlineMs: number) => void;
  /** Optional bulk pad without per-entry objects (typed_arrays). */
  readonly schedulePad?: (count: number, farDeadlineMs: number) => void;
  readonly peekDeadlineMs: () => number | null;
  /** Pop all entries with deadlineMs <= nowMs. O(k log n) for k due. */
  readonly popDue: (nowMs: number) => DeadlineEntry[];
  readonly clear: () => void;
  readonly trimTo: (n: number) => void;
  readonly entries: () => readonly DeadlineEntry[];
};

export type DeadlineFireDefinition = "durable_trigger_record" | "bag_wake";

export type DeadlineSchedulerInfo = {
  readonly mechanism: "min_heap_setTimeout_to_next_deadline";
  /** Next-deadline find/pop complexity (must not be O(n) scan). */
  readonly nextDeadlineComplexity: "O(log n) binary_min_heap";
  readonly tickMs: number;
  readonly concurrency: number;
  readonly firedDefinition: DeadlineFireDefinition;
  readonly flushPolicy: TriggerFlushPolicyInfo | null;
  readonly note: string;
};

export const DEFAULT_DEADLINE_SLA_MS = 1_000;
export const DEFAULT_SCHEDULER_TICK_MS = 1;
/**
 * In-flight fires awaiting durable flush. Must exceed group_commit `batchMax`
 * (default 64) so the next batch can fill during async fsync (double-buffer).
 */
export const DEFAULT_DEADLINE_CONCURRENCY = 128;
export const DEFAULT_SLA_TARGET_PCT = 99;

export function makeDeadlineSchedulerInfo(args: {
  readonly tickMs?: number;
  readonly concurrency?: number;
  readonly firedDefinition?: DeadlineFireDefinition;
  readonly flushPolicy?: TriggerFlushPolicy | null;
}): DeadlineSchedulerInfo {
  const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
  const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
  const firedDefinition = args.firedDefinition ?? "durable_trigger_record";
  const flushPolicy =
    firedDefinition === "durable_trigger_record"
      ? describeFlushPolicy(args.flushPolicy ?? DEFAULT_TRIGGER_FLUSH_POLICY)
      : null;
  return {
    mechanism: "min_heap_setTimeout_to_next_deadline",
    nextDeadlineComplexity: "O(log n) binary_min_heap",
    tickMs,
    concurrency,
    firedDefinition,
    flushPolicy,
    note:
      firedDefinition === "durable_trigger_record"
        ? `Fired = trigger record flushed per policy (${flushPolicy?.mode}; crashSafe=${flushPolicy?.crashSafe}). Approval-expiry semantics, not bag load. Lateness stamped after flush. Peek O(1), schedule/popDue O(log n). Concurrent writers bounded by concurrency. Excess-over-tick = max(0, lateness − tickMs).`
        : "Fired = bag wake (load parked JSON). Peek O(1), schedule/popDue O(log n). Concurrent bag wakes bounded by concurrency.",
  };
}

function siftUp(heap: number[], deadlines: number[], i: number): void {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (deadlines[heap[p]!]! <= deadlines[heap[i]!]!) break;
    const tmp = heap[p]!;
    heap[p] = heap[i]!;
    heap[i] = tmp;
    i = p;
  }
}

function siftDown(heap: number[], deadlines: number[], i: number): void {
  const n = heap.length;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let smallest = i;
    if (l < n && deadlines[heap[l]!]! < deadlines[heap[smallest]!]!) smallest = l;
    if (r < n && deadlines[heap[r]!]! < deadlines[heap[smallest]!]!) smallest = r;
    if (smallest === i) break;
    const tmp = heap[i]!;
    heap[i] = heap[smallest]!;
    heap[smallest] = tmp;
    i = smallest;
  }
}

/** Object-per-entry schedule — diagnostic A/B vs typed_arrays under large N. */
export function makeDeadlineScheduleEffect(): Effect.Effect<DeadlineSchedule> {
  return Effect.sync(() => {
    const agents: DeadlineEntry[] = [];
    const heap: number[] = [];
    const deadlines: number[] = [];

    const rebuildHeap = () => {
      heap.length = 0;
      for (let i = 0; i < agents.length; i++) heap.push(i);
      for (let i = (heap.length >> 1) - 1; i >= 0; i--) siftDown(heap, deadlines, i);
    };

    return {
      shape: "object_entries" as const,
      size: () => agents.length,
      schedule: (agentId, deadlineMs) => {
        const idx = agents.length;
        agents.push({ agentId, deadlineMs });
        deadlines.push(deadlineMs);
        heap.push(idx);
        siftUp(heap, deadlines, heap.length - 1);
      },
      peekDeadlineMs: () => (heap.length === 0 ? null : deadlines[heap[0]!]!),
      popDue: (nowMs) => {
        const due: DeadlineEntry[] = [];
        while (heap.length > 0 && deadlines[heap[0]!]! <= nowMs) {
          const idx = heap[0]!;
          due.push(agents[idx]!);
          const last = heap.pop()!;
          if (heap.length > 0) {
            heap[0] = last;
            siftDown(heap, deadlines, 0);
          }
          deadlines[idx] = Number.POSITIVE_INFINITY;
        }
        return due;
      },
      clear: () => {
        agents.length = 0;
        deadlines.length = 0;
        heap.length = 0;
      },
      trimTo: (n) => {
        if (n >= agents.length) return;
        agents.length = n;
        deadlines.length = n;
        rebuildHeap();
      },
      entries: () => agents.slice(),
    };
  });
}

export function randomDeadlineMsEffect(
  nowMs: number,
  horizonMs: number,
  random: () => number = Math.random
): Effect.Effect<number> {
  return Effect.sync(() => {
    const h = Math.max(1, horizonMs);
    return nowMs + Math.floor(random() * h);
  });
}

export type DeadlineArmMode = "steady" | "burst" | "ramp";

export type DeadlineGcTrace = {
  readonly pauseCount: number;
  readonly pauseTotalMs: number;
  readonly pauseMaxMs: number;
  readonly majorPauseCount: number;
  readonly majorPauseMaxMs: number;
  /** Fires whose (deadline→firedAt) window overlapped a GC pause ≥ this ms. */
  readonly lateFiresOverlappingGc: number;
  readonly lateFiresOverlappingMajorGc: number;
  /** Of fires with lateness ≥ lateThresholdMs, fraction overlapping any GC. */
  readonly lateOverlapFraction: number;
  readonly lateThresholdMs: number;
  readonly note: string;
};

export type DeadlineBacklogTrend = {
  /** Wall samples of overdue-not-yet-started queue depth during the step. */
  readonly sampleCount: number;
  readonly sampleEveryMs: number;
  readonly startOverdue: number | null;
  readonly endOverdue: number | null;
  readonly finalStretchStartOverdue: number | null;
  readonly finalStretchEndOverdue: number | null;
  /** True when overdue depth rose over the final stretch (or hit the fail threshold). */
  readonly growing: boolean;
  readonly slopePerSec: number | null;
  readonly earlyStopBacklogExceeded: boolean;
  readonly note: string;
};

export type DeadlineArmResult = {
  readonly mode: DeadlineArmMode;
  readonly n: number;
  readonly fired: number;
  readonly slaMs: number;
  /** Offered arrival rate for this arm (deadlines/sec). Burst uses n / drainSeconds. */
  readonly arrivalRatePerSec: number;
  readonly pctWithinSla: number;
  readonly latenessP50Ms: number;
  readonly latenessP99Ms: number;
  readonly excessOverTickP50Ms: number;
  readonly excessOverTickP99Ms: number;
  readonly maxLatenessMs: number;
  readonly maxExcessOverTickMs: number;
  readonly wallMs: number;
  readonly scheduleShape: DeadlineScheduleShape;
  readonly gcTrace: DeadlineGcTrace | null;
  /** Step wall budget (steady-state ramp). Short place-ahead ramps omit this. */
  readonly stepDurationMs?: number;
  readonly backlogTrend?: DeadlineBacklogTrend | null;
  /**
   * Pass requires pctWithinSla ≥ target **and** non-growing backlog when
   * steady-state ramp is enabled. Short/legacy arms omit this (treat pct only).
   */
  readonly steadyStatePass?: boolean | null;
  readonly failReason?: string | null;
};

/** Ontologiql-aligned burst sizes for SHARED_HOST scaled-burst ladder. */
export const DEFAULT_SCALED_BURST_SIZES: readonly number[] = [
  512, 10_000, 100_000, 250_000, 500_000, 1_000_000,
];

export type ScaledBurstLadderResult = {
  readonly sizes: readonly number[];
  readonly arms: readonly DeadlineArmResult[];
  /** First size with pctWithinSla < slaTargetPct; null if all sizes met the target. */
  readonly firstMissSize: number | null;
  readonly note: string;
};

export type DeadlineAccuracyReport = {
  readonly slaMs: number;
  readonly slaTargetPct: number;
  readonly scheduler: DeadlineSchedulerInfo;
  readonly steady: DeadlineArmResult;
  readonly burst: DeadlineArmResult;
  /**
   * Max offered steady arrival rate (deadlines/sec) that still met slaTargetPct
   * within slaMs — under the declared flush policy. Comparable only when flush
   * policy matches across systems.
   */
  readonly sustainablePerSec: number;
  /** First offered rate that missed the SLA target (null if ramp never failed). */
  readonly firstRateMissingSlaPerSec: number | null;
  /** True when ramp includes a failing sample after the last pass. */
  readonly rampWentPastFailure: boolean;
  readonly ramp: readonly DeadlineArmResult[];
  /** Coarse ladder last-pass before binary refine (null if unmeasured / never passed). */
  readonly coarseSustainablePerSec?: number | null;
  readonly coarseFirstRateMissingSlaPerSec?: number | null;
  /** (firstFail − lastPass) / lastPass after refine — e.g. 0.04 → "±4%". */
  readonly rampResolutionRel?: number | null;
  readonly rampResolutionNote?: string | null;
  /** Crash-recovery proof for the flush policy, when run. */
  readonly crashTest: DeadlineCrashTestResult | null;
  /** SHARED_HOST scaled bursts — first size that misses the 1s SLA. */
  readonly scaledBursts: ScaledBurstLadderResult | null;
  /**
   * group_commit runtime accounting (fsyncs/sec + avg batch size) when the
   * fire path uses TriggerJournal — explains fraction of serial fsync ceiling.
   */
  readonly flushStats?: import("./trigger-journal.js").TriggerJournalFlushStats | null;
};

export type DeadlineCrashTestResult = {
  readonly ok: boolean;
  readonly policy: TriggerFlushPolicyInfo;
  readonly countedFired: number;
  readonly recoveredOnDisk: number;
  readonly missingFromDisk: number;
  readonly duplicateOnDisk: number;
  readonly note: string;
};

function maxOf(samples: readonly number[]): number {
  let m = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    if (v > m) m = v;
  }
  return m;
}

function summarizeArm(
  mode: DeadlineArmMode,
  samples: readonly number[],
  tickMs: number,
  slaMs: number,
  arrivalRatePerSec: number,
  wallMs: number,
  percentile: (samples: readonly number[], p: number) => number,
  scheduleShape: DeadlineScheduleShape = "object_entries",
  gcTrace: DeadlineGcTrace | null = null,
  extras?: {
    readonly stepDurationMs?: number;
    readonly backlogTrend?: DeadlineBacklogTrend | null;
    readonly steadyStatePass?: boolean | null;
    readonly failReason?: string | null;
  }
): DeadlineArmResult {
  const excess = samples.map((l) => Math.max(0, l - tickMs));
  const within = samples.filter((l) => l <= slaMs).length;
  const p = (arr: readonly number[], q: number) =>
    arr.length ? Number(percentile(arr, q).toFixed(3)) : 0;
  return {
    mode,
    n: samples.length,
    fired: samples.length,
    slaMs,
    arrivalRatePerSec: Number(arrivalRatePerSec.toFixed(2)),
    pctWithinSla: samples.length ? Number(((100 * within) / samples.length).toFixed(2)) : 0,
    latenessP50Ms: p(samples, 50),
    latenessP99Ms: p(samples, 99),
    excessOverTickP50Ms: p(excess, 50),
    excessOverTickP99Ms: p(excess, 99),
    maxLatenessMs: samples.length ? Number(maxOf(samples).toFixed(3)) : 0,
    maxExcessOverTickMs: excess.length ? Number(maxOf(excess).toFixed(3)) : 0,
    wallMs: Number(wallMs.toFixed(3)),
    scheduleShape,
    gcTrace,
    stepDurationMs: extras?.stepDurationMs,
    backlogTrend: extras?.backlogTrend ?? null,
    steadyStatePass: extras?.steadyStatePass ?? null,
    failReason: extras?.failReason ?? null,
  };
}

/**
 * Continuous offered arrivals for duration `stepDurationMs` — not a short
 * place-ahead burst. Samples overdue queue depth; fails steady-state when the
 * backlog is still growing in the final stretch (even if pctWithinSla looks OK).
 */
export function runSteadyArrivalPumpEffect(args: {
  readonly agentIds: readonly string[];
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly arrivalRatePerSec: number;
  readonly stepDurationMs: number;
  readonly slaMs?: number;
  readonly slaTargetPct?: number;
  readonly concurrency?: number;
  readonly tickMs?: number;
  readonly mode?: DeadlineArmMode;
  readonly requireNonGrowingBacklog?: boolean;
  /**
   * When true (default), stop the step once overdue depth stays above ~1s of
   * arrivals. Set false for saturating drain throughput (keep writing for the
   * full window while capping the pending queue).
   */
  readonly allowBacklogEarlyStop?: boolean;
  /** Cap overdue-not-started queue (default ≈1–2s of arrivals, bounded for drain). */
  readonly maxPending?: number;
  /** Sample overdue depth this often. */
  readonly backlogSampleEveryMs?: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineArmResult> {
  return Effect.promise(async () => {
    const arrivalRatePerSec = Math.max(0.1, args.arrivalRatePerSec);
    const stepDurationMs = Math.max(50, args.stepDurationMs);
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const slaTargetPct = args.slaTargetPct ?? DEFAULT_SLA_TARGET_PCT;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const mode = args.mode ?? "ramp";
    const requireNonGrowingBacklog = args.requireNonGrowingBacklog !== false;
    const allowBacklogEarlyStop = args.allowBacklogEarlyStop !== false;
    const sampleEveryMs = Math.max(10, args.backlogSampleEveryMs ?? 100);
    const ids = args.agentIds.length > 0 ? args.agentIds : ["agent_0"];
    const intervalMs = 1000 / arrivalRatePerSec;
    // One SLA-second of arrivals — beyond this the step is not sustainable.
    const backlogFailThreshold = Math.max(
      concurrency * 8,
      Math.ceil(arrivalRatePerSec * (slaMs / 1000))
    );
    const maxPending = Math.max(
      concurrency * 32,
      Math.min(
        args.maxPending ?? Number.POSITIVE_INFINITY,
        Math.max(backlogFailThreshold, Math.ceil(arrivalRatePerSec * 0.25))
      )
    );

    const samples: number[] = [];
    const backlogSeries: { tMs: number; overdue: number; inFlight: number }[] = [];
    const pending: DeadlineEntry[] = [];
    let nextDeadlineMs = Date.now();
    let idCursor = 0;
    let inFlight = 0;
    let consecutiveHigh = 0;
    let earlyStopBacklogExceeded = false;
    const t0 = Date.now();
    const tEnd = t0 + stepDurationMs;

    const launch = (entry: DeadlineEntry): void => {
      inFlight += 1;
      void args.fire(entry).then(
        () => {
          const firedAt = Date.now();
          samples.push(Math.max(0, firedAt - entry.deadlineMs));
          inFlight -= 1;
        },
        () => {
          samples.push(Math.max(slaMs * 2, Date.now() - entry.deadlineMs));
          inFlight -= 1;
        }
      );
    };

    let lastSampleAt = t0;
    while (Date.now() < tEnd && !earlyStopBacklogExceeded) {
      const now = Date.now();
      while (nextDeadlineMs <= now && nextDeadlineMs < tEnd) {
        if (pending.length >= maxPending) {
          // Keep the arrival clock moving; drop excess rather than unbounded grow.
          nextDeadlineMs += intervalMs;
          if (allowBacklogEarlyStop) {
            earlyStopBacklogExceeded = true;
            break;
          }
          continue;
        }
        pending.push({
          agentId: ids[idCursor % ids.length]!,
          deadlineMs: nextDeadlineMs,
        });
        idCursor += 1;
        nextDeadlineMs += intervalMs;
      }
      while (inFlight < concurrency && pending.length > 0) {
        launch(pending.shift()!);
      }
      if (now - lastSampleAt >= sampleEveryMs) {
        backlogSeries.push({ tMs: now - t0, overdue: pending.length, inFlight });
        lastSampleAt = now;
        if (allowBacklogEarlyStop && pending.length >= backlogFailThreshold) {
          consecutiveHigh += 1;
          if (consecutiveHigh >= 3) {
            earlyStopBacklogExceeded = true;
            break;
          }
        } else {
          consecutiveHigh = 0;
        }
      }
      if (pending.length === 0 && inFlight < concurrency && nextDeadlineMs > now) {
        const sleepMs = Math.min(tickMs, Math.max(1, nextDeadlineMs - now));
        await new Promise<void>((r) => setTimeout(r, sleepMs));
      } else {
        await new Promise<void>((r) => setImmediate(r));
      }
    }

    // Drain what was already due; do not accept new arrivals past tEnd.
    const drainDeadline = Date.now() + Math.max(slaMs * 2, 5_000);
    while ((pending.length > 0 || inFlight > 0) && Date.now() < drainDeadline) {
      while (inFlight < concurrency && pending.length > 0) {
        launch(pending.shift()!);
      }
      await new Promise<void>((r) => setImmediate(r));
    }

    const stretchStart = stepDurationMs * 0.75;
    const stretch = backlogSeries.filter((s) => s.tMs >= stretchStart);
    const startOverdue = backlogSeries[0]?.overdue ?? null;
    const endOverdue = backlogSeries.length
      ? backlogSeries[backlogSeries.length - 1]!.overdue
      : null;
    const stretchStartOverdue = stretch[0]?.overdue ?? null;
    const stretchEndOverdue = stretch.length ? stretch[stretch.length - 1]!.overdue : null;
    let slopePerSec: number | null = null;
    let growing = earlyStopBacklogExceeded;
    if (stretch.length >= 4) {
      const mid = stretch.length >> 1;
      const earlyAvg =
        stretch.slice(0, mid).reduce((a, s) => a + s.overdue, 0) / Math.max(1, mid);
      const lateAvg =
        stretch.slice(mid).reduce((a, s) => a + s.overdue, 0) /
        Math.max(1, stretch.length - mid);
      const dtSec = Math.max(
        0.001,
        ((stretch[stretch.length - 1]!.tMs - stretch[0]!.tMs) / 1000) * 0.5
      );
      slopePerSec = Number(((lateAvg - earlyAvg) / dtSec).toFixed(2));
      const growthFloor = Math.max(10, earlyAvg * 0.05);
      if (lateAvg > earlyAvg + growthFloor) growing = true;
    } else if (
      stretchStartOverdue != null &&
      stretchEndOverdue != null &&
      stretchEndOverdue > stretchStartOverdue + Math.max(10, stretchStartOverdue * 0.05)
    ) {
      growing = true;
    }

    const backlogTrend: DeadlineBacklogTrend = {
      sampleCount: backlogSeries.length,
      sampleEveryMs: sampleEveryMs,
      startOverdue,
      endOverdue,
      finalStretchStartOverdue: stretchStartOverdue,
      finalStretchEndOverdue: stretchEndOverdue,
      growing,
      slopePerSec,
      earlyStopBacklogExceeded,
      note: earlyStopBacklogExceeded
        ? `Overdue queue hit ≥${backlogFailThreshold} (≈1s of arrivals) — step is not sustainable.`
        : growing
          ? "Overdue depth rose over the final stretch — short steps can hide this behind a still-OK lateness %."
          : "Overdue depth stable over the final stretch.",
    };

    const within = samples.filter((l) => l <= slaMs).length;
    const pctWithinSla = samples.length
      ? Number(((100 * within) / samples.length).toFixed(2))
      : 0;
    const pctOk = pctWithinSla >= slaTargetPct;
    const backlogOk = !requireNonGrowingBacklog || !growing;
    const steadyStatePass = pctOk && backlogOk;
    let failReason: string | null = null;
    if (!pctOk && !backlogOk) failReason = "sla_and_growing_backlog";
    else if (!pctOk) failReason = "sla_miss";
    else if (!backlogOk) failReason = "growing_backlog";

    return summarizeArm(
      mode,
      samples,
      tickMs,
      slaMs,
      arrivalRatePerSec,
      Date.now() - t0,
      args.percentile,
      "typed_arrays",
      null,
      {
        stepDurationMs,
        backlogTrend,
        steadyStatePass,
        failReason,
      }
    );
  });
}

type GcPauseInterval = {
  readonly startPerfMs: number;
  readonly endPerfMs: number;
  readonly durationMs: number;
  readonly major: boolean;
};

function attachGcObserver(): {
  readonly pauses: GcPauseInterval[];
  readonly disconnect: () => void;
} {
  const pauses: GcPauseInterval[] = [];
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType !== "gc") continue;
      const detail = (entry as { detail?: { kind?: number } }).detail;
      // Node: kind 1=Scavenge, 2=Mark/Sweep/Compact (major-ish), 4=Incremental, 8=WeakCB
      const kind = detail?.kind ?? 0;
      const major = kind === 2 || entry.duration >= 50;
      pauses.push({
        startPerfMs: entry.startTime,
        endPerfMs: entry.startTime + entry.duration,
        durationMs: entry.duration,
        major,
      });
    }
  });
  try {
    obs.observe({ entryTypes: ["gc"], buffered: false });
  } catch {
    /* gc entries unavailable */
  }
  return {
    pauses,
    disconnect: () => {
      try {
        obs.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

function buildGcTrace(
  pauses: readonly GcPauseInterval[],
  fireWindows: readonly {
    readonly startPerfMs: number;
    readonly endPerfMs: number;
    readonly latenessMs: number;
  }[],
  lateThresholdMs: number
): DeadlineGcTrace {
  const late = fireWindows.filter((f) => f.latenessMs >= lateThresholdMs);
  let lateOverlap = 0;
  let lateMajorOverlap = 0;
  for (const f of late) {
    let hit = false;
    let hitMajor = false;
    for (const p of pauses) {
      if (p.endPerfMs < f.startPerfMs || p.startPerfMs > f.endPerfMs) continue;
      hit = true;
      if (p.major) hitMajor = true;
    }
    if (hit) lateOverlap += 1;
    if (hitMajor) lateMajorOverlap += 1;
  }
  const major = pauses.filter((p) => p.major);
  return {
    pauseCount: pauses.length,
    pauseTotalMs: Number(pauses.reduce((a, p) => a + p.durationMs, 0).toFixed(3)),
    pauseMaxMs: pauses.length ? Number(maxOf(pauses.map((p) => p.durationMs)).toFixed(3)) : 0,
    majorPauseCount: major.length,
    majorPauseMaxMs: major.length ? Number(maxOf(major.map((p) => p.durationMs)).toFixed(3)) : 0,
    lateFiresOverlappingGc: lateOverlap,
    lateFiresOverlappingMajorGc: lateMajorOverlap,
    lateOverlapFraction: late.length ? Number((lateOverlap / late.length).toFixed(3)) : 0,
    lateThresholdMs,
    note:
      late.length === 0
        ? "No fires at/above late threshold."
        : lateOverlap / late.length >= 0.5
          ? `≥50% of late fires (≥${lateThresholdMs} ms) overlapped a GC pause — GC is a plausible cause of the tail.`
          : `Only ${(100 * lateOverlap) / late.length}% of late fires overlapped GC — look elsewhere for the tail (timer grain, flush wait, event-loop).`,
  };
}

function sleepUntil(deadlineMs: number, tickMs: number, wallDeadlineMs: number): Promise<void> {
  return new Promise((resolve) => {
    const step = () => {
      const now = Date.now();
      if (now >= deadlineMs || now >= wallDeadlineMs) {
        resolve();
        return;
      }
      const remaining = Math.min(deadlineMs, wallDeadlineMs) - now;
      if (remaining <= tickMs) {
        setImmediate(step);
        return;
      }
      setTimeout(step, Math.max(1, remaining - tickMs));
    };
    step();
  });
}

/** Bounded parallel map. */
async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

/**
 * Pump with concurrent fire handlers. Lateness is stamped **after** `fire`
 * resolves — for durable_trigger_record that means after the flush policy
 * has made the record durable.
 */
export function runDeadlinePumpEffect(args: {
  readonly schedule: DeadlineSchedule;
  /** Resolves only when the fire is complete (durable flush or bag wake). */
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly maxFires: number;
  readonly wallDeadlineMs: number;
  readonly tickMs?: number;
  readonly slaMs?: number;
  readonly concurrency?: number;
  readonly mode?: DeadlineArmMode;
  readonly arrivalRatePerSec: number;
  readonly traceGc?: boolean;
  readonly lateGcThresholdMs?: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineArmResult> {
  return Effect.promise(async () => {
    const {
      schedule,
      fire,
      maxFires,
      wallDeadlineMs,
      percentile,
      arrivalRatePerSec,
      tickMs = DEFAULT_SCHEDULER_TICK_MS,
      slaMs = DEFAULT_DEADLINE_SLA_MS,
      concurrency = DEFAULT_DEADLINE_CONCURRENCY,
      mode = "steady",
      traceGc = true,
      lateGcThresholdMs = 100,
    } = args;
    const samples: number[] = [];
    const fireWindows: { startPerfMs: number; endPerfMs: number; latenessMs: number }[] = [];
    const scheduleShape: DeadlineScheduleShape = schedule.shape ?? "object_entries";
    const gc = traceGc ? attachGcObserver() : null;
    let fired = 0;
    const t0 = Date.now();
    const { performance } = await import("node:perf_hooks");
    // Map Date.now() ↔ performance.now() so GC pauses can overlap the
    // full deadline→fired window (including sleepUntil waits), not just fire().
    const dateToPerfOffset = Date.now() - performance.now();

    try {
      while (fired < maxFires && Date.now() < wallDeadlineMs) {
        const next = schedule.peekDeadlineMs();
        if (next === null || !Number.isFinite(next)) break;
        const now = Date.now();
        if (next > now) {
          await sleepUntil(next, tickMs, wallDeadlineMs);
          continue;
        }
        const due = schedule.popDue(Date.now());
        if (due.length === 0) {
          await new Promise<void>((r) => setImmediate(r));
          continue;
        }
        const batch = due.slice(0, maxFires - fired);
        const batchMeta = await mapPool(batch, concurrency, async (entry) => {
          await fire(entry);
          const firedAt = Date.now();
          const latenessMs = Math.max(0, firedAt - entry.deadlineMs);
          return {
            latenessMs,
            // Window from when the deadline fell due through durable fire.
            startPerfMs: entry.deadlineMs - dateToPerfOffset,
            endPerfMs: firedAt - dateToPerfOffset,
          };
        });
        for (const m of batchMeta) {
          samples.push(m.latenessMs);
          fireWindows.push(m);
          fired += 1;
        }
      }
    } finally {
      gc?.disconnect();
    }

    const gcTrace =
      gc && fireWindows.length > 0 ? buildGcTrace(gc.pauses, fireWindows, lateGcThresholdMs) : null;

    return summarizeArm(
      mode,
      samples,
      tickMs,
      slaMs,
      arrivalRatePerSec,
      Date.now() - t0,
      percentile,
      scheduleShape,
      gcTrace
    );
  });
}

function placeSteadyDeadlines(
  schedule: DeadlineSchedule,
  agentIds: readonly string[],
  nowMs: number,
  horizonMs: number,
  count: number
): number {
  const n = Math.min(count, agentIds.length);
  for (let i = 0; i < n; i++) {
    // Even spacing across the horizon → constant offered arrival rate.
    const deadlineMs = nowMs + Math.floor(((i + 0.5) * horizonMs) / n);
    schedule.schedule(agentIds[i % agentIds.length]!, deadlineMs);
  }
  return n;
}

/**
 * Ramp offered steady arrival rate until pctWithinSla drops below targetPct.
 * Returns the last rate that still met the target (sustainablePerSec).
 */
export function makeAccuracyScheduleEffect(args: {
  readonly residentHeapSize: number;
  readonly scheduleShape?: DeadlineScheduleShape;
  readonly headroom?: number;
}): Effect.Effect<DeadlineSchedule> {
  const shape = args.scheduleShape ?? "typed_arrays";
  const cap = Math.max(1, args.residentHeapSize) + (args.headroom ?? 10_000);
  if (shape === "typed_arrays") {
    return makeTypedDeadlineScheduleEffect(cap);
  }
  return makeDeadlineScheduleEffect();
}

/**
 * Default ramp step duration for board/campaign honesty. Short place-ahead
 * windows (1–2s) can pass rates above drain while the backlog is still growing.
 */
export const DEFAULT_RAMP_STEP_DURATION_MS = 30_000;

export function rampSustainableRateEffect(args: {
  readonly agentIds: readonly string[];
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly windowMs: number;
  readonly slaMs?: number;
  readonly slaTargetPct?: number;
  readonly tickMs?: number;
  readonly concurrency?: number;
  readonly ratesPerSec?: readonly number[];
  /**
   * After the coarse ladder finds last-pass / first-fail, binary-search until
   * (hi−lo)/lo ≤ this relative width (default 0.01 = ±1%). Set false / 0 to skip.
   */
  readonly refineRelative?: number | false;
  /** Far-future pad so ramp arms stress the same heap size as agents-at-limit. */
  readonly residentHeapSize?: number;
  readonly scheduleShape?: DeadlineScheduleShape;
  /**
   * Continuous-arrival step duration. Default 30s. Pass a small value (or 0 with
   * `legacyPlaceAheadRamp: true`) only for unit tests.
   */
  readonly minStepDurationMs?: number;
  /** Fail the step when overdue depth rises in the final stretch (default true). */
  readonly requireNonGrowingBacklog?: boolean;
  /**
   * Legacy: place all deadlines over `windowMs` then pump (short bursts can
   * overstate sustainablePerSec). Default false — continuous steady-state ramp.
   */
  readonly legacyPlaceAheadRamp?: boolean;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<{
  readonly sustainablePerSec: number;
  /** First offered rate that missed slaTargetPct (null if every rate met). */
  readonly firstRateMissingSlaPerSec: number | null;
  /** True when the ladder includes at least one failing sample after the last pass. */
  readonly rampWentPastFailure: boolean;
  readonly ramp: DeadlineArmResult[];
  /** Coarse last-pass before binary refine (null if never passed). */
  readonly coarseSustainablePerSec: number | null;
  readonly coarseFirstRateMissingSlaPerSec: number | null;
  /**
   * Relative width of the refined bracket: (firstFail − lastPass) / lastPass.
   * e.g. 0.01 → report "±1%" in evidence.
   */
  readonly rampResolutionRel: number | null;
  readonly rampResolutionNote: string | null;
  readonly rampMethodology: {
    readonly mode: "steady_arrival_continuous" | "legacy_place_ahead";
    readonly stepDurationMs: number;
    readonly requireNonGrowingBacklog: boolean;
    readonly note: string;
  };
}> {
  return Effect.gen(function* () {
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const targetPct = args.slaTargetPct ?? DEFAULT_SLA_TARGET_PCT;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const windowMs = Math.max(200, args.windowMs);
    const windowSec = windowMs / 1000;
    const residentHeapSize = Math.max(0, args.residentHeapSize ?? 0);
    const scheduleShape = args.scheduleShape ?? "typed_arrays";
    const refineRelative =
      args.refineRelative === false ? 0 : Math.max(0, args.refineRelative ?? 0.01);
    const legacyPlaceAheadRamp = args.legacyPlaceAheadRamp === true;
    const requireNonGrowingBacklog =
      args.requireNonGrowingBacklog !== false && !legacyPlaceAheadRamp;
    const stepDurationMs = legacyPlaceAheadRamp
      ? windowMs
      : Math.max(
          windowMs,
          args.minStepDurationMs ?? DEFAULT_RAMP_STEP_DURATION_MS
        );
    // Defaults sized for fsync / group-commit (not os_buffer page-cache rates).
    const rates =
      args.ratesPerSec ??
      ([50, 100, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000] as const);

    const armPasses = (arm: DeadlineArmResult): boolean => {
      if (arm.steadyStatePass != null) return arm.steadyStatePass;
      return arm.pctWithinSla >= targetPct;
    };

    const runRate = (rate: number): Effect.Effect<DeadlineArmResult> => {
      if (!legacyPlaceAheadRamp) {
        return runSteadyArrivalPumpEffect({
          agentIds: args.agentIds,
          fire: args.fire,
          arrivalRatePerSec: rate,
          stepDurationMs,
          slaMs,
          slaTargetPct: targetPct,
          concurrency,
          tickMs,
          mode: "ramp",
          requireNonGrowingBacklog,
          percentile: args.percentile,
        });
      }
      return Effect.gen(function* () {
        const count = Math.max(1, Math.floor(rate * windowSec));
        const offered = count / windowSec;
        const need = Math.max(count, args.agentIds.length);
        const rampIds =
          args.agentIds.length >= need
            ? args.agentIds
            : Array.from({ length: need }, (_, i) => {
                const base = args.agentIds[i % Math.max(1, args.agentIds.length)] ?? `agent_${i}`;
                return i < args.agentIds.length ? base : `${base}__ramp_${i}`;
              });
        const schedule = yield* makeAccuracyScheduleEffect({
          residentHeapSize: Math.max(count, residentHeapSize),
          scheduleShape,
        });
        const now = Date.now();
        placeSteadyDeadlines(schedule, rampIds, now, windowMs, count);
        padResidentHeap(schedule, Math.max(count, residentHeapSize), now + windowMs + 3_600_000);
        return yield* runDeadlinePumpEffect({
          schedule,
          fire: args.fire,
          maxFires: count,
          wallDeadlineMs: now + windowMs + 5_000,
          tickMs,
          slaMs,
          concurrency,
          mode: "ramp",
          arrivalRatePerSec: offered,
          percentile: args.percentile,
        });
      });
    };

    const ramp: DeadlineArmResult[] = [];
    let sustainable = 0;
    let firstRateMissingSlaPerSec: number | null = null;

    for (const rate of rates) {
      const arm = yield* runRate(rate);
      ramp.push(arm);
      if (armPasses(arm)) {
        sustainable = arm.arrivalRatePerSec;
      } else {
        firstRateMissingSlaPerSec = Number(arm.arrivalRatePerSec.toFixed(2));
        break;
      }
    }

    const coarseSustainablePerSec = sustainable > 0 ? Number(sustainable.toFixed(2)) : null;
    const coarseFirstRateMissingSlaPerSec = firstRateMissingSlaPerSec;

    // Binary-search between last pass and first fail until relative width ≤ refineRelative.
    if (
      refineRelative > 0 &&
      firstRateMissingSlaPerSec !== null &&
      sustainable > 0 &&
      firstRateMissingSlaPerSec > sustainable
    ) {
      let lo = sustainable;
      let hi = firstRateMissingSlaPerSec;
      let guard = 0;
      while ((hi - lo) / lo > refineRelative && guard < 24) {
        guard += 1;
        const mid = (lo + hi) / 2;
        const arm = yield* runRate(mid);
        ramp.push(arm);
        if (armPasses(arm)) {
          lo = arm.arrivalRatePerSec;
          sustainable = lo;
        } else {
          hi = arm.arrivalRatePerSec;
          firstRateMissingSlaPerSec = Number(hi.toFixed(2));
        }
      }
    }

    const rampResolutionRel =
      firstRateMissingSlaPerSec !== null && sustainable > 0
        ? Number(((firstRateMissingSlaPerSec - sustainable) / sustainable).toFixed(4))
        : null;
    const rampResolutionNote =
      rampResolutionRel !== null
        ? `±${(rampResolutionRel * 100).toFixed(1)}% (refined bracket; coarse ladder alone is too wide for cross-system compare)`
        : null;

    return {
      sustainablePerSec: Number(sustainable.toFixed(2)),
      firstRateMissingSlaPerSec,
      rampWentPastFailure: firstRateMissingSlaPerSec !== null,
      ramp,
      coarseSustainablePerSec,
      coarseFirstRateMissingSlaPerSec,
      rampResolutionRel,
      rampResolutionNote,
      rampMethodology: {
        mode: legacyPlaceAheadRamp ? "legacy_place_ahead" : "steady_arrival_continuous",
        stepDurationMs,
        requireNonGrowingBacklog,
        note: legacyPlaceAheadRamp
          ? "Legacy place-ahead ramp — can overstate sustainablePerSec when steps are shorter than the time for lateness to reach the SLA."
          : `Continuous arrivals for ${stepDurationMs}ms/step; fail if overdue backlog grows in the final stretch. Sustained must stay ≤ durable drain.`,
      },
    };
  });
}

/**
 * Pad a schedule with far-future entries so next-deadline ops run at the
 * claimed resident heap size (avoids measuring a 2k heap while claiming 2.5e6).
 * Typed schedules bulk-pad without per-entry objects; object schedules allocate.
 */
export function padResidentHeap(
  schedule: DeadlineSchedule,
  targetSize: number,
  farDeadlineMs: number
): void {
  const need = Math.max(0, targetSize - schedule.size());
  if (need === 0) return;
  if (typeof schedule.schedulePad === "function") {
    schedule.schedulePad(need, farDeadlineMs);
    return;
  }
  for (let i = 0; i < need; i++) {
    schedule.schedule("__pad__", farDeadlineMs + (i % 1_000));
  }
}

/**
 * SHARED_HOST scaled bursts: fire N co-timed deadlines at Ontologiql sizes
 * (512, 10k, 100k, …). Report the first size that misses the 1s SLA target.
 */
export function runScaledBurstLadderEffect(args: {
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly sizes?: readonly number[];
  readonly slaMs?: number;
  readonly slaTargetPct?: number;
  readonly tickMs?: number;
  readonly concurrency?: number;
  readonly burstOffsetMs?: number;
  readonly residentHeapSize?: number;
  readonly scheduleShape?: DeadlineScheduleShape;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<ScaledBurstLadderResult> {
  return Effect.gen(function* () {
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const slaTargetPct = args.slaTargetPct ?? DEFAULT_SLA_TARGET_PCT;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const burstOffsetMs = args.burstOffsetMs ?? 20;
    const scheduleShape = args.scheduleShape ?? "typed_arrays";
    const sizes = args.sizes ?? DEFAULT_SCALED_BURST_SIZES;
    const residentHeapSize = Math.max(0, args.residentHeapSize ?? 0);
    const arms: DeadlineArmResult[] = [];
    let firstMissSize: number | null = null;

    for (const size of sizes) {
      const n = Math.max(1, Math.floor(size));
      const ids = Array.from(
        { length: n },
        (_, i) => `bag_${i.toString(16).padStart(8, "0")}_scaled`
      );
      const schedule = yield* makeAccuracyScheduleEffect({
        residentHeapSize: Math.max(n, residentHeapSize),
        scheduleShape,
      });
      const burstAt = Date.now() + burstOffsetMs;
      for (let i = 0; i < n; i++) schedule.schedule(ids[i]!, burstAt);
      padResidentHeap(schedule, Math.max(n, residentHeapSize), burstAt + 3_600_000);
      const arm = yield* runDeadlinePumpEffect({
        schedule,
        fire: args.fire,
        maxFires: n,
        wallDeadlineMs: burstAt + Math.max(slaMs * 3, 15_000),
        tickMs,
        slaMs,
        concurrency,
        mode: "burst",
        arrivalRatePerSec: 0,
        percentile: args.percentile,
      });
      const withRate: DeadlineArmResult = {
        ...arm,
        arrivalRatePerSec:
          arm.wallMs > 0 ? Number(((arm.fired * 1000) / arm.wallMs).toFixed(2)) : 0,
      };
      arms.push(withRate);
      if (withRate.pctWithinSla < slaTargetPct) {
        firstMissSize = n;
        break;
      }
    }

    return {
      sizes: arms.map((a) => a.n),
      arms,
      firstMissSize,
      note:
        firstMissSize === null
          ? `All scaled burst sizes met ≥${slaTargetPct}% within ${slaMs} ms SLA.`
          : `First miss at N=${firstMissSize}: pctWithinSla below ${slaTargetPct}% (1s SLA).`,
    };
  });
}

/** Full deadline accuracy: steady + burst at a declared rate, plus sustainable ramp. */
export function runDeadlineAccuracyEffect(args: {
  readonly agentIds: readonly string[];
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly horizonMs: number;
  readonly slaMs?: number;
  readonly slaTargetPct?: number;
  readonly tickMs?: number;
  readonly concurrency?: number;
  readonly burstOffsetMs?: number;
  readonly firedDefinition?: DeadlineFireDefinition;
  readonly flushPolicy?: TriggerFlushPolicy;
  /** Offered rate for the steady showcase arm (deadlines/sec). */
  readonly steadyArrivalRatePerSec?: number;
  /**
   * Keep this many entries on the heap during accuracy arms (far-future pads)
   * so next-deadline cost matches the resident schedule at agents-at-limit.
   */
  readonly residentHeapSize?: number;
  /** object_entries (GC-heavy at large N) vs typed_arrays (board default). */
  readonly scheduleShape?: DeadlineScheduleShape;
  readonly rampWindowMs?: number;
  readonly rampRatesPerSec?: readonly number[];
  /** Binary-search refine target width; default 0.01 (±1%). Pass false to skip. */
  readonly rampRefineRelative?: number | false;
  /** Continuous ramp step duration (default 30s). Short values for unit tests only. */
  readonly rampMinStepDurationMs?: number;
  readonly rampRequireNonGrowingBacklog?: boolean;
  readonly rampLegacyPlaceAhead?: boolean;
  readonly skipRamp?: boolean;
  /**
   * Scaled bursts are SHARED_HOST-required but expensive; default skip unless
   * the board / measure script opts in (`skipScaledBursts: false`).
   */
  readonly skipScaledBursts?: boolean;
  readonly scaledBurstSizes?: readonly number[];
  readonly crashTest?: DeadlineCrashTestResult | null;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineAccuracyReport> {
  return Effect.gen(function* () {
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const slaTargetPct = args.slaTargetPct ?? DEFAULT_SLA_TARGET_PCT;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const burstOffsetMs = args.burstOffsetMs ?? 50;
    const firedDefinition = args.firedDefinition ?? "durable_trigger_record";
    const flushPolicy = args.flushPolicy ?? DEFAULT_TRIGGER_FLUSH_POLICY;
    const scheduleShape = args.scheduleShape ?? "typed_arrays";
    const ids = [...args.agentIds];
    const residentHeapSize = Math.max(0, args.residentHeapSize ?? 0);
    // Opt-in: full Ontologiql-sized ladder is multi-minute under group_commit.
    const skipScaledBursts =
      args.skipScaledBursts !== false && args.scaledBurstSizes === undefined
        ? true
        : args.skipScaledBursts === true;
    const scheduler = makeDeadlineSchedulerInfo({
      tickMs,
      concurrency,
      firedDefinition,
      flushPolicy: firedDefinition === "durable_trigger_record" ? flushPolicy : null,
    });

    if (ids.length === 0) {
      const empty = summarizeArm("steady", [], tickMs, slaMs, 0, 0, args.percentile);
      return {
        slaMs,
        slaTargetPct,
        scheduler,
        steady: empty,
        burst: { ...empty, mode: "burst" as const },
        sustainablePerSec: 0,
        firstRateMissingSlaPerSec: null,
        rampWentPastFailure: false,
        ramp: [],
        coarseSustainablePerSec: null,
        coarseFirstRateMissingSlaPerSec: null,
        rampResolutionRel: null,
        rampResolutionNote: null,
        crashTest: args.crashTest ?? null,
        scaledBursts: null,
      };
    }

    const steadyRate =
      args.steadyArrivalRatePerSec ?? ids.length / Math.max(0.001, args.horizonMs / 1000);
    const steadyCount = Math.min(
      ids.length,
      Math.max(1, Math.floor(steadyRate * (args.horizonMs / 1000)))
    );
    const steadySched = yield* makeAccuracyScheduleEffect({ residentHeapSize, scheduleShape });
    const steadyNow = Date.now();
    placeSteadyDeadlines(steadySched, ids, steadyNow, args.horizonMs, steadyCount);
    padResidentHeap(steadySched, residentHeapSize, steadyNow + args.horizonMs + 3_600_000);
    const steadyOffered = steadyCount / (args.horizonMs / 1000);
    const steady = yield* runDeadlinePumpEffect({
      schedule: steadySched,
      fire: args.fire,
      maxFires: steadyCount,
      wallDeadlineMs: steadyNow + args.horizonMs + 5_000,
      tickMs,
      slaMs,
      concurrency,
      mode: "steady",
      arrivalRatePerSec: steadyOffered,
      percentile: args.percentile,
    });

    const burstSched = yield* makeAccuracyScheduleEffect({ residentHeapSize, scheduleShape });
    const burstAt = Date.now() + burstOffsetMs;
    const burstN = Math.min(ids.length, steadyCount);
    for (let i = 0; i < burstN; i++) burstSched.schedule(ids[i]!, burstAt);
    padResidentHeap(burstSched, residentHeapSize, burstAt + args.horizonMs + 3_600_000);
    const burst = yield* runDeadlinePumpEffect({
      schedule: burstSched,
      fire: args.fire,
      maxFires: burstN,
      wallDeadlineMs: burstAt + Math.max(args.horizonMs, 10_000),
      tickMs,
      slaMs,
      concurrency,
      mode: "burst",
      // Burst offered rate is instantaneous; report drain throughput as n/wall.
      arrivalRatePerSec: 0,
      percentile: args.percentile,
    });
    const burstWithRate: DeadlineArmResult = {
      ...burst,
      arrivalRatePerSec:
        burst.wallMs > 0 ? Number(((burst.fired * 1000) / burst.wallMs).toFixed(2)) : 0,
    };

    let sustainablePerSec = 0;
    let firstRateMissingSlaPerSec: number | null = null;
    let rampWentPastFailure = false;
    let ramp: DeadlineArmResult[] = [];
    let coarseSustainablePerSec: number | null = null;
    let coarseFirstRateMissingSlaPerSec: number | null = null;
    let rampResolutionRel: number | null = null;
    let rampResolutionNote: string | null = null;
    if (!args.skipRamp) {
      const r = yield* rampSustainableRateEffect({
        agentIds: ids,
        fire: args.fire,
        windowMs: args.rampWindowMs ?? Math.max(1_000, Math.min(args.horizonMs, 3_000)),
        slaMs,
        slaTargetPct,
        tickMs,
        concurrency,
        ratesPerSec: args.rampRatesPerSec,
        refineRelative: args.rampRefineRelative,
        minStepDurationMs: args.rampMinStepDurationMs,
        requireNonGrowingBacklog: args.rampRequireNonGrowingBacklog,
        legacyPlaceAheadRamp: args.rampLegacyPlaceAhead,
        percentile: args.percentile,
        residentHeapSize,
        scheduleShape,
      });
      sustainablePerSec = r.sustainablePerSec;
      firstRateMissingSlaPerSec = r.firstRateMissingSlaPerSec;
      rampWentPastFailure = r.rampWentPastFailure;
      ramp = r.ramp;
      coarseSustainablePerSec = r.coarseSustainablePerSec;
      coarseFirstRateMissingSlaPerSec = r.coarseFirstRateMissingSlaPerSec;
      rampResolutionRel = r.rampResolutionRel;
      rampResolutionNote = r.rampResolutionNote;
    }

    let scaledBursts: ScaledBurstLadderResult | null = null;
    if (!skipScaledBursts) {
      scaledBursts = yield* runScaledBurstLadderEffect({
        fire: args.fire,
        sizes: args.scaledBurstSizes,
        slaMs,
        slaTargetPct,
        tickMs,
        concurrency,
        burstOffsetMs,
        residentHeapSize,
        scheduleShape,
        percentile: args.percentile,
      });
    }

    return {
      slaMs,
      slaTargetPct,
      scheduler,
      steady,
      burst: burstWithRate,
      sustainablePerSec,
      firstRateMissingSlaPerSec,
      rampWentPastFailure,
      ramp,
      coarseSustainablePerSec,
      coarseFirstRateMissingSlaPerSec,
      rampResolutionRel,
      rampResolutionNote,
      crashTest: args.crashTest ?? null,
      scaledBursts,
    };
  });
}
