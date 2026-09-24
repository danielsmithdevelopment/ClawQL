import { Context, Effect, Layer } from "effect";
import {
  detectMeshAtrDrift,
  type MeshAtrDriftReport,
  type PolicyAllowSet,
} from "../drift.js";
import {
  bridgeMeshDenial,
  decideSessionCellPlacement,
  type BridgedMeshDenial,
  type MeshDenialEvent,
  type PlacementDecision,
  type PlacementRequest,
} from "../session-placement.js";
import type { BurstArchitectureWORMEntryType } from "../worm-types.js";
import { BURST_ARCHITECTURE_WORM_ENTRY_TYPES } from "../worm-types.js";

export class BurstOperatorService extends Context.Tag(
  "clawql/BurstOperatorService"
)<
  BurstOperatorService,
  {
    readonly detectDrift: (
      meshAllows: PolicyAllowSet,
      atrAllows: PolicyAllowSet
    ) => Effect.Effect<MeshAtrDriftReport>;
    readonly wormEntryTypes: () => Effect.Effect<
      readonly BurstArchitectureWORMEntryType[]
    >;
    readonly placeSessionCell: (
      req: PlacementRequest
    ) => Effect.Effect<PlacementDecision>;
    readonly bridgeMeshDenial: (
      event: MeshDenialEvent
    ) => Effect.Effect<BridgedMeshDenial>;
  }
>() {}

export const BurstOperatorServiceLive = Layer.succeed(
  BurstOperatorService,
  BurstOperatorService.of({
    detectDrift: (meshAllows, atrAllows) =>
      detectMeshAtrDrift(meshAllows, atrAllows),
    wormEntryTypes: () => Effect.succeed(BURST_ARCHITECTURE_WORM_ENTRY_TYPES),
    placeSessionCell: (req) => Effect.sync(() => decideSessionCellPlacement(req)),
    bridgeMeshDenial: (event) => Effect.sync(() => bridgeMeshDenial(event)),
  })
);

export function runBurstOperatorEffect<A, E>(
  program: Effect.Effect<A, E, BurstOperatorService>
): Promise<A> {
  return Effect.runPromise(
    program.pipe(Effect.provide(BurstOperatorServiceLive))
  );
}
