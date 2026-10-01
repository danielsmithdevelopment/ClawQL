import { describe, expect, it } from "vitest";
import {
  createCoalesceState,
  markDelivered,
  mergeStreamChangedDiffs,
  takeOrHoldDelivery,
  flushReadyPending,
} from "./coalesce.js";
import type { DeliverableEvent } from "./types.js";

function evt(diff: {
  added?: unknown[];
  removed?: unknown[];
  changed?: Array<{ path: string; before: unknown; after: unknown }>;
  summary?: string;
}): DeliverableEvent {
  return {
    eventId: `evt_${Math.random().toString(16).slice(2)}`,
    name: "stream.changed",
    timestamp: new Date().toISOString(),
    data: {
      topic: "job1",
      summary: diff.summary ?? "changed",
      changed_at: new Date().toISOString(),
      diff: {
        added: diff.added ?? [],
        removed: diff.removed ?? [],
        changed: diff.changed ?? [],
        truncated: false,
      },
    },
  };
}

describe("coalesce", () => {
  it("merges diffs under caps", () => {
    const merged = mergeStreamChangedDiffs(
      { added: [{ id: 1 }], removed: [], changed: [], truncated: false },
      {
        added: [],
        removed: [],
        changed: [{ path: "state", before: "open", after: "closed" }],
        truncated: false,
      }
    )!;
    expect(merged.added).toHaveLength(1);
    expect(merged.changed).toHaveLength(1);
  });

  it("holds within min interval then flushes with combined diff", () => {
    const state = createCoalesceState(5_000);
    const t0 = 1_000_000;
    const first = takeOrHoldDelivery(state, "sub1", evt({ added: [{ id: 1 }] }), {
      rateLimited: false,
      now: t0,
    });
    expect(first).toBeTruthy();
    markDelivered(state, "sub1", t0);

    const held = takeOrHoldDelivery(
      state,
      "sub1",
      evt({ changed: [{ path: "a", before: 1, after: 2 }] }),
      { rateLimited: false, now: t0 + 100 }
    );
    expect(held).toBeNull();
    expect(state.pending.get("sub1")?.event.data.coalesced_count).toBe(1);

    const held2 = takeOrHoldDelivery(state, "sub1", evt({ added: [{ id: 2 }] }), {
      rateLimited: false,
      now: t0 + 200,
    });
    expect(held2).toBeNull();
    expect(state.pending.get("sub1")?.event.data.coalesced_count).toBe(2);

    const ready = flushReadyPending(state, {
      now: t0 + 5_100,
      canDeliver: () => true,
    });
    expect(ready).toHaveLength(1);
    expect(ready[0]!.event.data.coalesced_count).toBeGreaterThanOrEqual(2);
    const diff = ready[0]!.event.data.diff as { added: unknown[]; changed: unknown[] };
    expect(diff.added.length + diff.changed.length).toBeGreaterThanOrEqual(2);
  });

  it("holds when rate-limited even if interval elapsed", () => {
    const state = createCoalesceState(0);
    const held = takeOrHoldDelivery(state, "sub1", evt({}), {
      rateLimited: true,
      now: Date.now(),
    });
    expect(held).toBeNull();
    expect(state.pending.has("sub1")).toBe(true);
  });
});
