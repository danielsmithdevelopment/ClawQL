/**
 * Karpenter lifecycle façade → BurstWatchStub + WORM types (§8 filler / headroom).
 *
 * Maps NodeClaim / Node disruption-shaped records into watch events and
 * OperatorLifecycleWORMEntryType labels. No live Karpenter API client —
 * hosts feed CRD watch payloads or mocks; real provision/evict stays external.
 */

import { Context, Effect, Layer } from "effect";
import type { OperatorLifecycleWORMEntryType } from "../worm-types.js";
import type { WatchEvent } from "./burst-watch-stub.js";
import type { BurstWatchStub } from "./burst-watch-stub.js";

export type KarpenterLifecyclePhase =
  "provisioning" | "ready" | "terminating" | "disrupting" | "unknown";

export type KarpenterLifecycleRecord = {
  readonly kind?: string;
  readonly name: string;
  readonly phase?: KarpenterLifecyclePhase | string;
  readonly reason?: string;
  readonly sessionId?: string;
  readonly nodeName?: string;
  /** When true, treat as filler preemption for headroom. */
  readonly fillerEviction?: boolean;
};

export type KarpenterLifecycleMapped = {
  readonly wormType: OperatorLifecycleWORMEntryType;
  readonly watchEvent: WatchEvent | null;
  readonly note: string;
};

function normalizePhase(raw: string | undefined): KarpenterLifecyclePhase {
  const p = (raw ?? "unknown").toLowerCase();
  if (p === "provisioning" || p === "pending") return "provisioning";
  if (p === "ready" || p === "registered") return "ready";
  if (p === "terminating" || p === "deleting") return "terminating";
  if (p === "disrupting" || p === "draining" || p === "emptied") return "disrupting";
  return "unknown";
}

/**
 * Map one Karpenter-shaped lifecycle record to WORM type + optional watch event.
 */
export function mapKarpenterLifecycle(
  rec: KarpenterLifecycleRecord
): Effect.Effect<KarpenterLifecycleMapped> {
  return Effect.sync(() => {
    const phase = normalizePhase(rec.phase);
    const reason = rec.reason ?? phase;
    const sessionId = rec.sessionId ?? `karpenter:${rec.name}`;

    if (rec.fillerEviction || (phase === "disrupting" && reason.toLowerCase().includes("filler"))) {
      return {
        wormType: "FILLER_WORKLOAD_EVICTED" as const,
        watchEvent: {
          kind: "pod_eviction_request" as const,
          sessionId,
          reason: `filler_evicted:${reason}`,
        },
        note: "Filler preemption for celld headroom (scaffold mapping).",
      };
    }

    if (phase === "provisioning") {
      return {
        wormType: "KARPENTER_NODE_REQUESTED" as const,
        watchEvent: {
          kind: "node_load" as const,
          nodes: [
            {
              nodeId: rec.nodeName ?? rec.name,
              runningCellCount: 0,
              memoryUtil: 0,
              newlyProvisioned: true,
            },
          ],
        },
        note: "NodeClaim provisioning → prefer new capacity for placement.",
      };
    }

    if (phase === "terminating" || phase === "disrupting") {
      return {
        wormType: "CELLD_FLEET_NODE_DROPPED" as const,
        watchEvent: {
          kind: "pod_eviction_request" as const,
          sessionId,
          reason: `node_${phase}:${reason}`,
        },
        note: "Node disruption / terminate → session re-placement signal.",
      };
    }

    if (phase === "ready") {
      return {
        wormType: "CELLD_CAPACITY_HEADROOM_REQUESTED" as const,
        watchEvent: {
          kind: "node_load" as const,
          nodes: [
            {
              nodeId: rec.nodeName ?? rec.name,
              runningCellCount: 0,
              memoryUtil: 0.05,
              newlyProvisioned: true,
            },
          ],
        },
        note: "Node ready — capacity available for burst fill.",
      };
    }

    return {
      wormType: "CELLD_CAPACITY_HEADROOM_REQUESTED" as const,
      watchEvent: null,
      note: `Unrecognized phase "${rec.phase ?? ""}" — no watch event.`,
    };
  });
}

export class KarpenterLifecycleWatchService extends Context.Tag(
  "clawql/KarpenterLifecycleWatchService"
)<
  KarpenterLifecycleWatchService,
  {
    readonly map: (rec: KarpenterLifecycleRecord) => Effect.Effect<KarpenterLifecycleMapped>;
    readonly ingest: (records: readonly KarpenterLifecycleRecord[]) => Effect.Effect<{
      readonly mapped: readonly KarpenterLifecycleMapped[];
      readonly watchEvents: readonly WatchEvent[];
    }>;
  }
>() {}

export function makeKarpenterLifecycleWatchService(): Context.Tag.Service<
  typeof KarpenterLifecycleWatchService
> {
  return {
    map: (rec) => mapKarpenterLifecycle(rec),
    ingest: (records) =>
      Effect.gen(function* () {
        const mapped: KarpenterLifecycleMapped[] = [];
        const watchEvents: WatchEvent[] = [];
        for (const rec of records) {
          const m = yield* mapKarpenterLifecycle(rec);
          mapped.push(m);
          if (m.watchEvent) watchEvents.push(m.watchEvent);
        }
        return { mapped, watchEvents };
      }),
  };
}

export const KarpenterLifecycleWatchLive: Layer.Layer<KarpenterLifecycleWatchService> =
  Layer.succeed(KarpenterLifecycleWatchService, makeKarpenterLifecycleWatchService());

/** Push mapped Karpenter events onto BurstWatchStub. */
export function enqueueKarpenterRecordsToStub(
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  records: readonly KarpenterLifecycleRecord[]
): Effect.Effect<
  { readonly enqueued: number; readonly wormTypes: readonly OperatorLifecycleWORMEntryType[] },
  never,
  KarpenterLifecycleWatchService
> {
  return Effect.gen(function* () {
    const svc = yield* KarpenterLifecycleWatchService;
    const { mapped, watchEvents } = yield* svc.ingest(records);
    for (const ev of watchEvents) {
      yield* stub.enqueue(ev);
    }
    return {
      enqueued: watchEvents.length,
      wormTypes: mapped.map((m) => m.wormType),
    };
  });
}
