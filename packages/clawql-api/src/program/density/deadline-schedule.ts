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

import { Effect } from "effect";
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

export type DeadlineEntry = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

export type DeadlineSchedule = {
  readonly size: () => number;
  readonly schedule: (agentId: string, deadlineMs: number) => void;
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
export const DEFAULT_DEADLINE_CONCURRENCY = 64;
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
  readonly ramp: readonly DeadlineArmResult[];
  /** Crash-recovery proof for the flush policy, when run. */
  readonly crashTest: DeadlineCrashTestResult | null;
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
  percentile: (samples: readonly number[], p: number) => number
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
    } = args;
    const samples: number[] = [];
    let fired = 0;
    const t0 = Date.now();

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
      const batchLateness = await mapPool(batch, concurrency, async (entry) => {
        await fire(entry);
        const firedAt = Date.now();
        return Math.max(0, firedAt - entry.deadlineMs);
      });
      for (const lateness of batchLateness) {
        samples.push(lateness);
        fired += 1;
      }
    }

    return summarizeArm(
      mode,
      samples,
      tickMs,
      slaMs,
      arrivalRatePerSec,
      Date.now() - t0,
      percentile
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
export function rampSustainableRateEffect(args: {
  readonly agentIds: readonly string[];
  readonly fire: (entry: DeadlineEntry) => Promise<void>;
  readonly windowMs: number;
  readonly slaMs?: number;
  readonly slaTargetPct?: number;
  readonly tickMs?: number;
  readonly concurrency?: number;
  readonly ratesPerSec?: readonly number[];
  /** Far-future pad so ramp arms stress the same heap size as agents-at-limit. */
  readonly residentHeapSize?: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<{
  readonly sustainablePerSec: number;
  readonly ramp: DeadlineArmResult[];
}> {
  return Effect.gen(function* () {
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const targetPct = args.slaTargetPct ?? DEFAULT_SLA_TARGET_PCT;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const concurrency = args.concurrency ?? DEFAULT_DEADLINE_CONCURRENCY;
    const windowMs = Math.max(200, args.windowMs);
    const windowSec = windowMs / 1000;
    const residentHeapSize = Math.max(0, args.residentHeapSize ?? 0);
    // Defaults sized for fsync / group-commit (not os_buffer page-cache rates).
    const rates =
      args.ratesPerSec ??
      ([50, 100, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000] as const);
    const maxCount = Math.max(
      1,
      ...rates.map((r) => Math.floor(r * windowSec)),
      args.agentIds.length
    );
    // Synthetic ids so high rates are not capped by the wake-sample pool.
    const rampIds =
      args.agentIds.length >= maxCount
        ? args.agentIds
        : Array.from({ length: maxCount }, (_, i) => {
            const base = args.agentIds[i % Math.max(1, args.agentIds.length)] ?? `agent_${i}`;
            return i < args.agentIds.length ? base : `${base}__ramp_${i}`;
          });

    const ramp: DeadlineArmResult[] = [];
    let sustainable = 0;

    for (const rate of rates) {
      const count = Math.max(1, Math.min(rampIds.length, Math.floor(rate * windowSec)));
      const offered = count / windowSec;
      const schedule = yield* makeDeadlineScheduleEffect();
      const now = Date.now();
      placeSteadyDeadlines(schedule, rampIds, now, windowMs, count);
      padResidentHeap(schedule, Math.max(count, residentHeapSize), now + windowMs + 3_600_000);
      const arm = yield* runDeadlinePumpEffect({
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
      ramp.push(arm);
      if (arm.pctWithinSla >= targetPct) {
        sustainable = offered;
      } else {
        break;
      }
    }

    return { sustainablePerSec: Number(sustainable.toFixed(2)), ramp };
  });
}

/**
 * Pad a schedule with far-future entries so next-deadline ops run at the
 * claimed resident heap size (avoids measuring a 2k heap while claiming 2.5e6).
 * Pads share one agentId — identity is irrelevant; size is what stresses the heap.
 */
function padResidentHeap(
  schedule: DeadlineSchedule,
  targetSize: number,
  farDeadlineMs: number
): void {
  const need = Math.max(0, targetSize - schedule.size());
  for (let i = 0; i < need; i++) {
    schedule.schedule("__pad__", farDeadlineMs + (i % 1_000));
  }
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
  readonly rampWindowMs?: number;
  readonly rampRatesPerSec?: readonly number[];
  readonly skipRamp?: boolean;
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
    const ids = [...args.agentIds];
    const residentHeapSize = Math.max(0, args.residentHeapSize ?? 0);
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
        ramp: [],
        crashTest: args.crashTest ?? null,
      };
    }

    const steadyRate =
      args.steadyArrivalRatePerSec ?? ids.length / Math.max(0.001, args.horizonMs / 1000);
    const steadyCount = Math.min(
      ids.length,
      Math.max(1, Math.floor(steadyRate * (args.horizonMs / 1000)))
    );
    const steadySched = yield* makeDeadlineScheduleEffect();
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

    const burstSched = yield* makeDeadlineScheduleEffect();
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
    let ramp: DeadlineArmResult[] = [];
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
        percentile: args.percentile,
        residentHeapSize,
      });
      sustainablePerSec = r.sustainablePerSec;
      ramp = r.ramp;
    }

    return {
      slaMs,
      slaTargetPct,
      scheduler,
      steady,
      burst: burstWithRate,
      sustainablePerSec,
      ramp,
      crashTest: args.crashTest ?? null,
    };
  });
}
