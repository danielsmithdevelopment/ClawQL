import { WORMAuditTrailService } from "clawql-audit";
import { Effect } from "effect";
import type { HarnessRegistryState } from "./registry.js";

/** Verify hash chain after a harness session (WORM completeness smoke). */
export const verifyHarnessWormTrail = (
  _state: HarnessRegistryState
): Effect.Effect<boolean, never, WORMAuditTrailService> =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    const report = yield* worm.verify().pipe(Effect.catchAll(() => Effect.succeed(null)));
    return report?.valid === true;
  });
