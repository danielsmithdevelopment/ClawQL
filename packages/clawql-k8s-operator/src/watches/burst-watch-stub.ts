/**
 * In-memory K8s / mesh watch stubs for burst operator (§8 / §13 dry-run).
 * Not a real informer — feeds synthetic events into placement + mesh-denial bridge.
 */

import { Context, Effect, Layer, Ref } from "effect";
import {
  bridgeMeshDenial,
  decideSessionCellPlacement,
  type BridgedMeshDenial,
  type CelldNodeLoad,
  type MeshDenialEvent,
  type PlacementDecision,
  type PlacementRequest,
} from "../session-placement.js";
import { detectMeshAtrDrift, type MeshAtrDriftReport, type PolicyAllowSet } from "../drift.js";

export type WatchEventKind = "mesh_denial" | "pod_eviction_request" | "node_load";

export type WatchEvent =
  | { readonly kind: "mesh_denial"; readonly event: MeshDenialEvent }
  | {
      readonly kind: "pod_eviction_request";
      readonly sessionId: string;
      readonly reason: string;
    }
  | { readonly kind: "node_load"; readonly nodes: readonly CelldNodeLoad[] };

export type WatchDispatchResult = {
  readonly processed: number;
  readonly meshBridges: readonly BridgedMeshDenial[];
  readonly placements: readonly PlacementDecision[];
  readonly driftReports: readonly MeshAtrDriftReport[];
};

export class BurstWatchStub extends Context.Tag("clawql/BurstWatchStub")<
  BurstWatchStub,
  {
    readonly enqueue: (event: WatchEvent) => Effect.Effect<void>;
    readonly drain: (args?: {
      readonly atrAllows?: PolicyAllowSet;
      readonly meshAllows?: PolicyAllowSet;
      readonly placement?: PlacementRequest;
    }) => Effect.Effect<WatchDispatchResult>;
    readonly snapshotQueue: () => Effect.Effect<readonly WatchEvent[]>;
  }
>() {}

export function makeBurstWatchStub(): Effect.Effect<Context.Tag.Service<typeof BurstWatchStub>> {
  return Effect.gen(function* () {
    const queue = yield* Ref.make<WatchEvent[]>([]);
    return {
      enqueue: (event) => Ref.update(queue, (xs) => [...xs, event]),
      snapshotQueue: () => Ref.get(queue),
      drain: (args) =>
        Effect.gen(function* () {
          const events = yield* Ref.get(queue);
          yield* Ref.set(queue, []);
          const meshBridges: BridgedMeshDenial[] = [];
          const placements: PlacementDecision[] = [];
          const driftReports: MeshAtrDriftReport[] = [];
          let latestNodes: readonly CelldNodeLoad[] = [];

          for (const ev of events) {
            if (ev.kind === "mesh_denial") {
              meshBridges.push(bridgeMeshDenial(ev.event));
            } else if (ev.kind === "node_load") {
              latestNodes = ev.nodes;
            } else if (ev.kind === "pod_eviction_request" && args?.placement) {
              placements.push(
                decideSessionCellPlacement({
                  ...args.placement,
                  sessionId: ev.sessionId,
                  nodes: latestNodes.length > 0 ? latestNodes : args.placement.nodes,
                })
              );
            }
          }

          if (args?.atrAllows && args?.meshAllows) {
            driftReports.push(yield* detectMeshAtrDrift(args.meshAllows, args.atrAllows));
          }

          if (args?.placement && placements.length === 0) {
            placements.push(
              decideSessionCellPlacement({
                ...args.placement,
                nodes: latestNodes.length > 0 ? latestNodes : args.placement.nodes,
              })
            );
          }

          return {
            processed: events.length,
            meshBridges,
            placements,
            driftReports,
          };
        }),
    };
  });
}

export const BurstWatchStubLive: Layer.Layer<BurstWatchStub> = Layer.effect(
  BurstWatchStub,
  makeBurstWatchStub()
);
