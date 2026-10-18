import { Context, Effect, Layer } from "effect";
import { detectMeshAtrDrift, type MeshAtrDriftReport, type PolicyAllowSet } from "../drift.js";
import {
  bridgeMeshDenial,
  decideSessionCellPlacement,
  type BridgedMeshDenial,
  type MeshDenialEvent,
  type PlacementDecision,
  type PlacementRequest,
} from "../session-placement.js";
import {
  appendBridgedMeshDenialEffect,
  type HostWormAppendResult,
  resolveHostWormConfig,
} from "../worm-append.js";
import type { BurstArchitectureWORMEntryType } from "../worm-types.js";
import { BURST_ARCHITECTURE_WORM_ENTRY_TYPES } from "../worm-types.js";

export class BurstOperatorService extends Context.Service<BurstOperatorService, {
    readonly detectDrift: (
      meshAllows: PolicyAllowSet,
      atrAllows: PolicyAllowSet
    ) => Effect.Effect<MeshAtrDriftReport>;
    readonly wormEntryTypes: () => Effect.Effect<readonly BurstArchitectureWORMEntryType[]>;
    readonly placeSessionCell: (req: PlacementRequest) => Effect.Effect<PlacementDecision>;
    readonly bridgeMeshDenial: (event: MeshDenialEvent) => Effect.Effect<BridgedMeshDenial>;
    /** Shape + host append (deferred when CLAWQL_AUDIT_WORM_URL unset). */
    readonly appendMeshDenialToHostWorm: (
      event: MeshDenialEvent
    ) => Effect.Effect<{ bridged: BridgedMeshDenial; append: HostWormAppendResult }>;
  }>()("clawql/BurstOperatorService") {}

export const BurstOperatorServiceLive = Layer.succeed(
  BurstOperatorService,
  BurstOperatorService.of({
    detectDrift: (meshAllows, atrAllows) => detectMeshAtrDrift(meshAllows, atrAllows),
    wormEntryTypes: () => Effect.succeed(BURST_ARCHITECTURE_WORM_ENTRY_TYPES),
    placeSessionCell: (req) => Effect.sync(() => decideSessionCellPlacement(req)),
    bridgeMeshDenial: (event) => Effect.sync(() => bridgeMeshDenial(event)),
    appendMeshDenialToHostWorm: (event) =>
      appendBridgedMeshDenialEffect(event, resolveHostWormConfig()),
  })
);

export function runBurstOperatorEffect<A, E>(
  program: Effect.Effect<A, E, BurstOperatorService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(BurstOperatorServiceLive)));
}
