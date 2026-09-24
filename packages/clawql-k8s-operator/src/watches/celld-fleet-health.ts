/**
 * celld fleet health from S3 lease-shaped records (§8 fleet health).
 *
 * Hosts inject lease snapshots (from S3 List/Get or a mock). Stale / missing
 * leases → CELLD_FLEET_NODE_DROPPED watch signals. No AWS SDK calls here.
 */

import { Context, Effect, Layer } from "effect";
import type { OperatorLifecycleWORMEntryType } from "../worm-types.js";
import type { WatchEvent } from "./burst-watch-stub.js";
import type { BurstWatchStub } from "./burst-watch-stub.js";

export type CelldLeaseRecord = {
  readonly nodeId: string;
  /** Epoch ms when the lease was last renewed. */
  readonly renewedAtMs: number;
  /** Lease TTL in ms (default 30s if omitted at check time). */
  readonly ttlMs?: number;
  readonly peerIds?: readonly string[];
};

export type FleetHealthFinding = {
  readonly nodeId: string;
  readonly wormType: OperatorLifecycleWORMEntryType;
  readonly reason: string;
  readonly staleByMs: number;
};

export type FleetHealthReport = {
  readonly ok: boolean;
  readonly checkedAtMs: number;
  readonly findings: readonly FleetHealthFinding[];
  readonly watchEvents: readonly WatchEvent[];
  readonly note: string;
};

export type FleetHealthCheckArgs = {
  readonly leases: readonly CelldLeaseRecord[];
  /** Expected node ids that must appear in the lease set. */
  readonly expectedNodeIds?: readonly string[];
  readonly nowMs?: number;
  readonly defaultTtlMs?: number;
};

/**
 * Compare lease snapshots to expected fleet membership.
 * Stale or missing leases produce CELLD_FLEET_NODE_DROPPED findings.
 */
export function evaluateCelldFleetHealth(
  args: FleetHealthCheckArgs
): Effect.Effect<FleetHealthReport> {
  return Effect.sync(() => {
    const now = args.nowMs ?? Date.now();
    const defaultTtl = args.defaultTtlMs ?? 30_000;
    const byId = new Map(args.leases.map((l) => [l.nodeId, l]));
    const findings: FleetHealthFinding[] = [];
    const watchEvents: WatchEvent[] = [];

    const expected = args.expectedNodeIds ?? args.leases.map((l) => l.nodeId);

    for (const nodeId of expected) {
      const lease = byId.get(nodeId);
      if (!lease) {
        const finding: FleetHealthFinding = {
          nodeId,
          wormType: "CELLD_FLEET_NODE_DROPPED",
          reason: "lease_missing",
          staleByMs: Number.POSITIVE_INFINITY,
        };
        findings.push(finding);
        watchEvents.push({
          kind: "pod_eviction_request",
          sessionId: `fleet:${nodeId}`,
          reason: "lease_missing",
        });
        continue;
      }
      const ttl = lease.ttlMs ?? defaultTtl;
      const age = now - lease.renewedAtMs;
      if (age > ttl) {
        const finding: FleetHealthFinding = {
          nodeId,
          wormType: "CELLD_FLEET_NODE_DROPPED",
          reason: "lease_stale",
          staleByMs: age - ttl,
        };
        findings.push(finding);
        watchEvents.push({
          kind: "pod_eviction_request",
          sessionId: `fleet:${nodeId}`,
          reason: `lease_stale:${age - ttl}ms`,
        });
      }
    }

    return {
      ok: findings.length === 0,
      checkedAtMs: now,
      findings,
      watchEvents,
      note: "Scaffold lease evaluation only — not live S3 ListObjects evidence.",
    } satisfies FleetHealthReport;
  });
}

export class CelldFleetHealthService extends Context.Tag("clawql/CelldFleetHealthService")<
  CelldFleetHealthService,
  {
    readonly check: (args: FleetHealthCheckArgs) => Effect.Effect<FleetHealthReport>;
  }
>() {}

export function makeCelldFleetHealthService(): Context.Tag.Service<typeof CelldFleetHealthService> {
  return {
    check: (args) => evaluateCelldFleetHealth(args),
  };
}

export const CelldFleetHealthLive: Layer.Layer<CelldFleetHealthService> = Layer.succeed(
  CelldFleetHealthService,
  makeCelldFleetHealthService()
);

/** Run fleet health and enqueue drop signals onto BurstWatchStub. */
export function enqueueFleetHealthToStub(
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  args: FleetHealthCheckArgs
): Effect.Effect<FleetHealthReport, never, CelldFleetHealthService> {
  return Effect.gen(function* () {
    const svc = yield* CelldFleetHealthService;
    const report = yield* svc.check(args);
    for (const ev of report.watchEvents) {
      yield* stub.enqueue(ev);
    }
    return report;
  });
}
