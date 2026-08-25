import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";

/** Shared filter predicate for in-memory / post-query filtering. */
export const matchesWORMFilter = (entry: WORMEntry, filter: WORMFilter): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
    if (filter.type && entry.type !== filter.type) return false;
    if (filter.agentName && entry.agentName !== filter.agentName) return false;
    if (filter.since && entry.timestamp < filter.since) return false;
    if (filter.until && entry.timestamp > filter.until) return false;
    return true;
  });

/** Apply filter + pagination to an already-loaded list (chain order assumed). */
export const applyWORMFilter = (
  entries: readonly WORMEntry[],
  filter: WORMFilter
): Effect.Effect<WORMEntry[]> =>
  Effect.gen(function* () {
    const out: WORMEntry[] = [];
    for (const entry of entries) {
      if (yield* matchesWORMFilter(entry, filter)) out.push(entry);
    }
    const offset = filter.offset ?? 0;
    const sliced = offset > 0 ? out.slice(offset) : out;
    if (filter.limit !== undefined) return sliced.slice(0, filter.limit);
    return sliced;
  });
