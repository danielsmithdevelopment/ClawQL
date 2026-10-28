/**
 * In-memory wake-deadline schedule for fair parked agents.
 *
 * A real agent waiting on approval has a deadline (expiry / reminder). Something
 * must fire it on time — this min-heap is the working-system resident state the
 * density board requires at limit (not an id→path Map; bag path is derived).
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
    const heap: number[] = []; // indices into agents
    const deadlines: number[] = []; // parallel to agents for fast compare

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
          // Leave agents[] dense for trim/entries; mark deadline as -1 (already fired).
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

export type DeadlineLateness = {
  readonly p50: number;
  readonly p99: number;
  readonly n: number;
  readonly fired: number;
  readonly horizonMs: number;
  readonly maxLatenessMs: number;
};

/**
 * Pump the schedule on the wall clock: sleep/spin until due, wake via `wake`,
 * record lateness = max(0, firedAt - deadlineMs). Stops after `maxFires` or
 * when the schedule is empty of finite deadlines, or `wallDeadlineMs` passes.
 */
export function runDeadlinePumpEffect(args: {
  readonly schedule: DeadlineSchedule;
  readonly wake: (agentId: string) => Promise<void>;
  readonly maxFires: number;
  readonly wallDeadlineMs: number;
  readonly percentile: (samples: readonly number[], p: number) => number;
}): Effect.Effect<DeadlineLateness> {
  return Effect.promise(async () => {
    const { schedule, wake, maxFires, wallDeadlineMs, percentile } = args;
    const samples: number[] = [];
    let fired = 0;
    const t0 = Date.now();
    const horizonMs = Math.max(1, wallDeadlineMs - t0);

    while (fired < maxFires && Date.now() < wallDeadlineMs) {
      const now = Date.now();
      const next = schedule.peekDeadlineMs();
      if (next === null || !Number.isFinite(next)) break;
      if (next > now) {
        const wait = Math.min(next - now, wallDeadlineMs - now, 25);
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, wait));
        }
        continue;
      }
      const due = schedule.popDue(Date.now());
      if (due.length === 0) {
        await new Promise((r) => setTimeout(r, 1));
        continue;
      }
      for (const entry of due) {
        if (fired >= maxFires) break;
        const firedAt = Date.now();
        await wake(entry.agentId);
        const lateness = Math.max(0, firedAt - entry.deadlineMs);
        samples.push(lateness);
        fired += 1;
      }
    }

    const p50 = samples.length ? percentile(samples, 50) : 0;
    const p99 = samples.length ? percentile(samples, 99) : 0;
    return {
      p50: Number(p50.toFixed(3)),
      p99: Number(p99.toFixed(3)),
      n: samples.length,
      fired,
      horizonMs,
      maxLatenessMs: samples.length ? Number(Math.max(...samples).toFixed(3)) : 0,
    };
  });
}
