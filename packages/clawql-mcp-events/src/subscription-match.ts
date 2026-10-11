/**
 * Inbound webhook traffic reuses stream.changed but must not fan out to
 * existing projection/schedule subscribers. Opt in with arguments.source.
 */

import { Effect } from "effect";

export const inboundSourceLabel = (provider: string): string =>
  `inbound:${provider.trim().toLowerCase()}`;

export const isInboundEventData = (data: Record<string, unknown>): boolean => {
  if (data.untrusted === true) return true;
  const source = data.source;
  return typeof source === "string" && source.trim().toLowerCase().startsWith("inbound:");
};

/** Exact match, or `inbound:*` / `prefix:*` wildcard. */
export const filterValueMatches = (filter: string, actual: string): boolean => {
  const f = filter.trim();
  const a = actual.trim();
  if (!f) return false;
  if (f === "*") return true;
  if (f === a) return true;
  if (f.endsWith(":*")) {
    const prefix = f.slice(0, -1); // keep trailing ":"
    return a.startsWith(prefix);
  }
  return false;
};

/**
 * Inbound events are excluded unless the subscription sets `source` to the
 * inbound label (`inbound:github`) or `inbound:*`.
 */
export const subscriptionAllowsInboundEffect = (
  filters: Record<string, unknown>,
  data: Record<string, unknown>
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (!isInboundEventData(data)) return true;
    const want = typeof filters.source === "string" ? filters.source.trim() : "";
    if (!want) return false;
    const got = typeof data.source === "string" ? data.source : "";
    return filterValueMatches(want, got);
  });

export const matchesEventFiltersEffect = (
  filters: Record<string, unknown>,
  data: Record<string, unknown>
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const inboundOk = yield* subscriptionAllowsInboundEffect(filters, data);
    if (!inboundOk) return false;

    const filterSource =
      typeof filters.source === "string" && filters.source.trim().startsWith("inbound:");
    if (!isInboundEventData(data) && filterSource) {
      // Inbound-only subscription must not receive schedule/projection changes.
      return false;
    }

    for (const [k, v] of Object.entries(filters)) {
      if (v == null || v === "") continue;
      if (typeof v === "string") {
        const actual = data[k];
        if (typeof actual !== "string" || !filterValueMatches(v, actual)) return false;
        continue;
      }
      if (data[k] !== v) return false;
    }
    return true;
  });
