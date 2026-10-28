/**
 * Typed-array deadline min-heap: Float64 deadlines + Int32 heap indices.
 * Agent ids live in a sparse Map (pads have no id entry) so a 2.5e6 resident
 * schedule does not allocate 2.5e6 heap objects for the collector to walk.
 */

import { Effect } from "effect";

export type TypedDeadlineEntry = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

export type TypedDeadlineSchedule = {
  readonly shape: "typed_arrays";
  readonly capacity: () => number;
  readonly size: () => number;
  readonly schedule: (agentId: string, deadlineMs: number) => void;
  /** Bulk-schedule far-future pads without creating per-entry objects. */
  readonly schedulePad: (count: number, farDeadlineMs: number) => void;
  readonly peekDeadlineMs: () => number | null;
  readonly popDue: (nowMs: number) => TypedDeadlineEntry[];
  readonly clear: () => void;
  readonly trimTo: (n: number) => void;
  readonly entries: () => readonly TypedDeadlineEntry[];
};

function siftUp(heap: Int32Array, heapLen: number, deadlines: Float64Array, i: number): void {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (deadlines[heap[p]!]! <= deadlines[heap[i]!]!) break;
    const tmp = heap[p]!;
    heap[p] = heap[i]!;
    heap[i] = tmp;
    i = p;
  }
}

function siftDown(heap: Int32Array, heapLen: number, deadlines: Float64Array, i: number): void {
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let smallest = i;
    if (l < heapLen && deadlines[heap[l]!]! < deadlines[heap[smallest]!]!) smallest = l;
    if (r < heapLen && deadlines[heap[r]!]! < deadlines[heap[smallest]!]!) smallest = r;
    if (smallest === i) break;
    const tmp = heap[i]!;
    heap[i] = heap[smallest]!;
    heap[smallest] = tmp;
    i = smallest;
  }
}

/**
 * Pre-sized typed-array schedule. `capacity` should be ≥ agents-at-limit
 * (or the accuracy pad size) so pads never reallocate.
 */
export function makeTypedDeadlineScheduleEffect(
  capacity: number
): Effect.Effect<TypedDeadlineSchedule> {
  return Effect.sync(() => {
    const cap = Math.max(1, Math.floor(capacity));
    const deadlines = new Float64Array(cap);
    const heap = new Int32Array(cap);
    const agentBySlot = new Map<number, string>();
    let size = 0;
    let heapLen = 0;
    // Free-list of recycled slots after pop (optional); for accuracy pads we
    // rarely pop pads, so a dense size counter is enough.
    const freeSlots: number[] = [];

    const allocSlot = (): number => {
      if (freeSlots.length > 0) return freeSlots.pop()!;
      if (size >= cap) {
        throw new Error(`typed deadline schedule capacity exceeded (${cap})`);
      }
      return size++;
    };

    const schedule = (agentId: string, deadlineMs: number) => {
      const slot = allocSlot();
      deadlines[slot] = deadlineMs;
      if (agentId !== "__pad__") agentBySlot.set(slot, agentId);
      heap[heapLen] = slot;
      siftUp(heap, heapLen + 1, deadlines, heapLen);
      heapLen += 1;
    };

    /**
     * Bulk-pad then **bottom-up heapify once** (O(n)), not per-entry siftUp.
     * Restart rebuilds rely on this: durable snapshot stores padCount, not
     * 2.5e6 parsed lines — format, not language, drives rebuildMs.
     */
    const schedulePad = (count: number, farDeadlineMs: number) => {
      const n = Math.max(0, Math.floor(count));
      for (let i = 0; i < n; i++) {
        const slot = allocSlot();
        deadlines[slot] = farDeadlineMs + (i % 1_000);
        // no agentBySlot entry for pads; heap rebuilt below
      }
      rebuildHeap();
    };

    const rebuildHeap = () => {
      heapLen = 0;
      for (let i = 0; i < size; i++) {
        if (Number.isFinite(deadlines[i]!) && deadlines[i]! < Number.POSITIVE_INFINITY) {
          heap[heapLen++] = i;
        }
      }
      for (let i = (heapLen >> 1) - 1; i >= 0; i--) siftDown(heap, heapLen, deadlines, i);
    };

    return {
      shape: "typed_arrays" as const,
      capacity: () => cap,
      size: () => size,
      schedule,
      schedulePad,
      peekDeadlineMs: () => (heapLen === 0 ? null : deadlines[heap[0]!]!),
      popDue: (nowMs) => {
        const due: TypedDeadlineEntry[] = [];
        while (heapLen > 0 && deadlines[heap[0]!]! <= nowMs) {
          const slot = heap[0]!;
          due.push({
            agentId: agentBySlot.get(slot) ?? "__pad__",
            deadlineMs: deadlines[slot]!,
          });
          heapLen -= 1;
          if (heapLen > 0) {
            heap[0] = heap[heapLen]!;
            siftDown(heap, heapLen, deadlines, 0);
          }
          deadlines[slot] = Number.POSITIVE_INFINITY;
          agentBySlot.delete(slot);
          freeSlots.push(slot);
        }
        return due;
      },
      clear: () => {
        size = 0;
        heapLen = 0;
        freeSlots.length = 0;
        agentBySlot.clear();
        deadlines.fill(0);
      },
      trimTo: (n) => {
        if (n >= size) return;
        // Dense trim: keep first n slots that still have finite deadlines is
        // awkward after pops; for limit runs we trim before pops.
        size = n;
        agentBySlot.forEach((_, slot) => {
          if (slot >= n) agentBySlot.delete(slot);
        });
        freeSlots.length = 0;
        rebuildHeap();
      },
      entries: () => {
        const out: TypedDeadlineEntry[] = [];
        for (let i = 0; i < size; i++) {
          if (!Number.isFinite(deadlines[i]!) || deadlines[i]! === Number.POSITIVE_INFINITY)
            continue;
          out.push({
            agentId: agentBySlot.get(i) ?? "__pad__",
            deadlineMs: deadlines[i]!,
          });
        }
        return out;
      },
    };
  });
}
