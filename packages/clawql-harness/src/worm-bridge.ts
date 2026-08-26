import { WORMAuditTrail } from "clawql-audit";
import { Effect } from "effect";
import type { HarnessRegistryState } from "./registry.js";

/** Verify hash chain after a harness session (WORM completeness smoke). */
export const verifyHarnessWormTrail = (
  _state: HarnessRegistryState
): Effect.Effect<boolean, never, WORMAuditTrail> =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    const report = yield* worm.verify().pipe(Effect.catchAll(() => Effect.succeed(null)));
    return report?.ok === true;
  });
