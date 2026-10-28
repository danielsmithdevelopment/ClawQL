/**
 * In-memory wake-deadline schedule for fair parked agents.
 *
 * A real agent waiting on approval has a deadline (expiry / reminder). Something
 * must fire it on time — this min-heap is the working-system resident state the
 * density board requires at limit (not an id→path Map; bag path is derived).
 *
 * Lateness methodology: record the scheduler tick/mechanism, report raw lateness
 * and excess-over-tick (load-induced), run steady + same-instant burst arms, and
 * score a shared SLA (default: fire within 1000 ms of the deadline).
 */

import { Effect } from "effect";

export type DeadlineEntry = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

export type DeadlineSchedule = {
  readonly size: () => number;
  readonly schedule: (agentId: string, deadlineMs: number) => void;
  readonly peekDeadlineMs: () => number | null;
  /** Pop all entries with deadlineMs <= nowMs (stable by deadline). */
  readonly popDue: (nowMs: number) => DeadlineEntry[];
  readonly clear: () => void;
  /** Keep only the first `n` scheduled agents (insertion order); rebuild heap. */
  readonly trimTo: (n: number) => void;
  /** Snapshot of scheduled agents (insertion order). */
  readonly entries: () => readonly DeadlineEntry[];
};

export type DeadlineSchedulerInfo = {
  /** How the pump wakes for the next due deadline. */
  readonly mechanism: "min_heap_setTimeout_to_next_deadline";
  /**
   * Effective wait quantum (ms) attributed to the scheduler itself — subtracted
   * when forming excess-over-tick lateness. setTimeout-to-next ≈ OS timer grain.
   */
  readonly tickMs: number;
  readonly note: string;
};

export const DEFAULT_DEADLINE_SLA_MS = 1_000;
export const DEFAULT_SCHEDULER_TICK_MS = 1;

export const DEADLINE_SCHEDULER_INFO: DeadlineSchedulerInfo = {
  mechanism: "min_heap_setTimeout_to_next_deadline",
  tickMs: DEFAULT_SCHEDULER_TICK_MS,
  note: "Min-heap of (deadlineMs, agentId); sleep with setTimeout until the next deadline (no fixed poll interval). tickMs is the attributed OS-timer grain used for excess-over-tick. Board SLA is absolute (raw lateness ≤ slaMs); excess measures load beyond the tick.",
};

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

/** Uniform random deadline in [nowMs, nowMs + horizonMs). */
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

export type DeadlineArmMode = "steady" | "burst";

export type DeadlineArmResult = {
  readonly mode: DeadlineArmMode;
  readonly n: number;
  readonly fired: number;
  readonly slaMs: number;
  /** Share of fires with raw lateness ≤ slaMs (0–100). */
  readonly pctWithinSla: number;
  readonly latenessP50Ms: number;
  readonly latenessP99Ms: number;
  /** max(0, lateness − tickMs) — load beyond scheduler grain. */
  readonly excessOverTickP50Ms: number;
  readonly excessOverTickP99Ms: number;
  readonly maxLatenessMs: number;
  readonly maxExcessOverTickMs: number;
};

export type DeadlineAccuracyReport = {
  readonly slaMs: number;
  readonly scheduler: DeadlineSchedulerInfo;
  readonly steady: DeadlineArmResult;
  readonly burst: DeadlineArmResult;
};

function summarizeArm(
  mode: DeadlineArmMode,
  samples: readonly number[],
  tickMs: number,
  slaMs: number,
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
    pctWithinSla: samples.length
      ? Number(((100 * within) / samples.length).toFixed(2))
      : 0,
    latenessP50Ms: p(samples, 50),
    latenessP99Ms: p(samples, 99),
    excessOverTickP50Ms: p(excess, 50),
    excessOverTickP99Ms: p(excess, 99),
    maxLatenessMs: samples.length ? Number(Math.max(...samples).toFixed(3)) : 0,
    maxExcessOverTickMs: excess.length ? Number(Math.max(...excess).toFixed(3)) : 0,
  };
}

/**
 * Sleep until `deadlineMs` using setTimeout for the bulk delay (no fixed poll
 * interval). Spins the last ~tickMs with setImmediate for tighter fire.
 */
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
      // Wake a tick early so the final spin covers the last grain.
      setTimeout(step, Math.max(1, remaining - tickMs));
    };
    step();
  });
}

/**
 * Pump the schedule: setTimeout-to-next-deadline (not a fixed poll). Records
 * raw lateness and excess-over-tick for each fire.
 */
export function runDeadlinePumpEffect(args: {
  readonly schedule: DeadlineSchedule;
  readonly wake: (agentId: string) => Promise<void>;
  readonly maxFires: number;
  readonly wallDeadlineMs: number;
  readonly tickMs?: number;
  readonly slaMs?: number;
  readonly mode?: DeadlineArmMode;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineArmResult> {
  return Effect.promise(async () => {
    const {
      schedule,
      wake,
      maxFires,
      wallDeadlineMs,
      percentile,
      tickMs = DEFAULT_SCHEDULER_TICK_MS,
      slaMs = DEFAULT_DEADLINE_SLA_MS,
      mode = "steady",
    } = args;
    const samples: number[] = [];
    let fired = 0;

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
      for (const entry of due) {
        if (fired >= maxFires) break;
        const firedAt = Date.now();
        await wake(entry.agentId);
        samples.push(Math.max(0, firedAt - entry.deadlineMs));
        fired += 1;
      }
    }

    return summarizeArm(mode, samples, tickMs, slaMs, percentile);
  });
}

/** Run steady (spread) then burst (same-instant) arms with the shared SLA. */
export function runDeadlineAccuracyEffect(args: {
  readonly agentIds: readonly string[];
  readonly wake: (agentId: string) => Promise<void>;
  readonly horizonMs: number;
  readonly slaMs?: number;
  readonly tickMs?: number;
  readonly burstOffsetMs?: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineAccuracyReport> {
  return Effect.gen(function* () {
    const slaMs = args.slaMs ?? DEFAULT_DEADLINE_SLA_MS;
    const tickMs = args.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
    const burstOffsetMs = args.burstOffsetMs ?? 50;
    const ids = [...args.agentIds];
    if (ids.length === 0) {
      const empty = summarizeArm("steady", [], tickMs, slaMs, args.percentile);
      return {
        slaMs,
        scheduler: { ...DEADLINE_SCHEDULER_INFO, tickMs },
        steady: empty,
        burst: { ...empty, mode: "burst" as const },
      };
    }

    const steadySched = yield* makeDeadlineScheduleEffect();
    const steadyNow = Date.now();
    for (const id of ids) {
      const dl = yield* randomDeadlineMsEffect(steadyNow, args.horizonMs);
      steadySched.schedule(id, dl);
    }
    const steady = yield* runDeadlinePumpEffect({
      schedule: steadySched,
      wake: args.wake,
      maxFires: ids.length,
      wallDeadlineMs: steadyNow + args.horizonMs + 5_000,
      tickMs,
      slaMs,
      mode: "steady",
      percentile: args.percentile,
    });

    const burstSched = yield* makeDeadlineScheduleEffect();
    const burstAt = Date.now() + burstOffsetMs;
    for (const id of ids) burstSched.schedule(id, burstAt);
    const burst = yield* runDeadlinePumpEffect({
      schedule: burstSched,
      wake: args.wake,
      maxFires: ids.length,
      wallDeadlineMs: burstAt + Math.max(args.horizonMs, 10_000),
      tickMs,
      slaMs,
      mode: "burst",
      percentile: args.percentile,
    });

    return {
      slaMs,
      scheduler: { ...DEADLINE_SCHEDULER_INFO, tickMs },
      steady,
      burst,
    };
  });
}
