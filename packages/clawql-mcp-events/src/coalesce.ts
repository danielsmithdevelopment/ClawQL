/**
 * Per-subscription delivery coalescing for busy stream.changed feeds.
 * Merges pending diffs instead of silently dropping when rate-limited or
 * within the minimum delivery interval.
 */

import type { DeliverableEvent } from "./types.js";

export type StreamChangedDiff = {
  added: unknown[];
  removed: unknown[];
  changed: Array<{ path: string; before: unknown; after: unknown }>;
  truncated: boolean;
};

const MAX_DIFF_ENTRIES = 20;
const MAX_DIFF_JSON_BYTES = 8 * 1024;

export type CoalescePending = {
  event: DeliverableEvent;
  firstAt: number;
  lastAt: number;
  mergedCount: number;
};

export type CoalesceState = {
  pending: Map<string, CoalescePending>;
  lastDeliveredAt: Map<string, number>;
  minIntervalMs: number;
};

export function createCoalesceState(minIntervalMs: number): CoalesceState {
  return {
    pending: new Map(),
    lastDeliveredAt: new Map(),
    minIntervalMs: Math.max(0, minIntervalMs),
  };
}

function asDiff(data: Record<string, unknown>): StreamChangedDiff | null {
  const d = data.diff;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const obj = d as Record<string, unknown>;
  return {
    added: Array.isArray(obj.added) ? obj.added : [],
    removed: Array.isArray(obj.removed) ? obj.removed : [],
    changed: Array.isArray(obj.changed)
      ? (obj.changed as StreamChangedDiff["changed"])
      : [],
    truncated: Boolean(obj.truncated),
  };
}

/** Merge two capped projection diffs; re-apply size/count caps. */
export function mergeStreamChangedDiffs(
  a: StreamChangedDiff | null,
  b: StreamChangedDiff | null
): StreamChangedDiff | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const added = [...a.added, ...b.added];
  const removed = [...a.removed, ...b.removed];
  const changed = [...a.changed, ...b.changed];
  let truncated = a.truncated || b.truncated;
  while (
    added.length + removed.length + changed.length > MAX_DIFF_ENTRIES ||
    Buffer.byteLength(JSON.stringify({ added, removed, changed }), "utf8") > MAX_DIFF_JSON_BYTES
  ) {
    truncated = true;
    if (changed.length) changed.pop();
    else if (added.length) added.pop();
    else if (removed.length) removed.pop();
    else break;
  }
  return { added, removed, changed, truncated };
}

export function mergeStreamChangedEvents(
  prev: DeliverableEvent,
  next: DeliverableEvent
): DeliverableEvent {
  const prevDiff = asDiff(prev.data);
  const nextDiff = asDiff(next.data);
  const diff = mergeStreamChangedDiffs(prevDiff, nextDiff);
  const mergedCount =
    (typeof prev.data.coalesced_count === "number" ? prev.data.coalesced_count : 1) +
    (typeof next.data.coalesced_count === "number" ? next.data.coalesced_count : 1);
  const summaryParts = [
    typeof prev.data.summary === "string" ? prev.data.summary : null,
    typeof next.data.summary === "string" ? next.data.summary : null,
  ].filter(Boolean);
  return {
    ...next,
    data: {
      ...next.data,
      ...(diff ? { diff } : {}),
      coalesced_count: mergedCount,
      summary:
        mergedCount > 1
          ? `Coalesced ${mergedCount} changes` +
            (diff
              ? ` (${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed${diff.truncated ? ", truncated" : ""})`
              : "")
          : (summaryParts[summaryParts.length - 1] as string),
    },
  };
}

/**
 * Decide whether to deliver now or hold in the coalesce buffer.
 * Returns the event to deliver (possibly merged pending), or null when held.
 * Caller must invoke {@link markDelivered} after a successful send.
 */
export function takeOrHoldDelivery(
  state: CoalesceState,
  subscriptionId: string,
  event: DeliverableEvent,
  opts: { rateLimited: boolean; now?: number }
): DeliverableEvent | null {
  const now = opts.now ?? Date.now();
  const existing = state.pending.get(subscriptionId);
  const merged = existing ? mergeStreamChangedEvents(existing.event, event) : event;
  const lastAt = state.lastDeliveredAt.get(subscriptionId) ?? 0;
  const withinInterval =
    state.minIntervalMs > 0 && now - lastAt < state.minIntervalMs;
  const hold = opts.rateLimited || withinInterval;

  if (hold) {
    const withCount: DeliverableEvent = existing
      ? merged
      : {
          ...merged,
          data: {
            ...merged.data,
            coalesced_count:
              typeof merged.data.coalesced_count === "number"
                ? merged.data.coalesced_count
                : 1,
          },
        };
    state.pending.set(subscriptionId, {
      event: withCount,
      firstAt: existing?.firstAt ?? now,
      lastAt: now,
      mergedCount:
        (existing?.mergedCount ?? 0) +
        (typeof event.data.coalesced_count === "number" ? event.data.coalesced_count : 1),
    });
    return null;
  }

  state.pending.delete(subscriptionId);
  return merged;
}

export function markDelivered(
  state: CoalesceState,
  subscriptionId: string,
  now = Date.now()
): void {
  state.lastDeliveredAt.set(subscriptionId, now);
  state.pending.delete(subscriptionId);
}

/** Flush pending deliveries that have waited out the min interval (and are not rate-limited). */
export function flushReadyPending(
  state: CoalesceState,
  opts: {
    now?: number;
    canDeliver: (subscriptionId: string) => boolean;
  }
): Array<{ subscriptionId: string; event: DeliverableEvent }> {
  const now = opts.now ?? Date.now();
  const out: Array<{ subscriptionId: string; event: DeliverableEvent }> = [];
  for (const [id, pending] of [...state.pending.entries()]) {
    const waited = now - pending.firstAt >= state.minIntervalMs;
    const sinceLast =
      state.minIntervalMs <= 0 ||
      now - (state.lastDeliveredAt.get(id) ?? 0) >= state.minIntervalMs;
    if (!waited || !sinceLast) continue;
    if (!opts.canDeliver(id)) continue;
    state.pending.delete(id);
    out.push({ subscriptionId: id, event: pending.event });
  }
  return out;
}

export function dropPendingForSubscription(state: CoalesceState, subscriptionId: string): void {
  state.pending.delete(subscriptionId);
  state.lastDeliveredAt.delete(subscriptionId);
}
