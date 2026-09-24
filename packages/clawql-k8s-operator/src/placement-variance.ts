/**
 * Placement variance simulation — synthetic spawn stream vs Modal “strongly
 * sub-Poisson” reference. Measures var/mean only; does not claim AWS results.
 */

import { Effect } from "effect";
import {
  decideSessionCellPlacement,
  type CelldNodeLoad,
  type PlacementDecision,
} from "./session-placement.js";

export type PlacementVarianceReport = {
  readonly samples: number;
  readonly uniqueNodes: number;
  readonly meanSpawnsPerNode: number;
  readonly variance: number;
  readonly varianceOverMean: number | null;
  readonly decisions: readonly PlacementDecision[];
  readonly note: string;
};

export function simulatePlacementVariance(args: {
  readonly sessions: number;
  readonly nodes: readonly CelldNodeLoad[];
  readonly thiccSessionThreshold?: number;
}): Effect.Effect<PlacementVarianceReport> {
  return Effect.sync(() => {
    const counts = new Map<string, number>();
    const decisions: PlacementDecision[] = [];
    const threshold = args.thiccSessionThreshold ?? 5;
    const spawnOnPreferred = new Map<string, number>();

    for (let i = 0; i < args.sessions; i++) {
      const sessionId = `sess-${i}`;
      const preferred = args.nodes[i % args.nodes.length]?.nodeId;
      const prior = preferred ? (spawnOnPreferred.get(preferred) ?? 0) : 0;
      const d = decideSessionCellPlacement({
        sessionId,
        subscriptionId: `sub-${i % 3}`,
        sessionSpawnCountOnPreferred: prior,
        preferredNodeId: preferred,
        thiccSessionThreshold: threshold,
        nodes: args.nodes,
      });
      decisions.push(d);
      counts.set(d.nodeId, (counts.get(d.nodeId) ?? 0) + 1);
      if (preferred) {
        spawnOnPreferred.set(preferred, prior + 1);
      }
    }

    const values = [...counts.values()];
    const mean = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.length === 0
        ? 0
        : values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;

    return {
      samples: args.sessions,
      uniqueNodes: counts.size,
      meanSpawnsPerNode: mean,
      variance,
      varianceOverMean: mean > 0 ? variance / mean : null,
      decisions,
      note: "Simulation only — Modal strongly-sub-Poisson claim is a reference, not measured here.",
    };
  });
}
