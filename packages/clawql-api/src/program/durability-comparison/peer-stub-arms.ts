/**
 * Peer / combination arms — private pilot stand-ins + celld skip.
 * Live named public boards still need maintainer invite (COMPARISON.md).
 */

import { Effect } from "effect";
import { golemArm, golemClawqlArm, piDurableArm, piDurableClawqlArm } from "./peer-pilot-arms.js";
import type { ArmResult, DurabilityArm } from "./types.js";

export { golemArm, golemClawqlArm, piDurableArm, piDurableClawqlArm };

export const programCelldArm: DurabilityArm = {
  id: "clawql-program-celld",
  run: () =>
    Effect.sync(() => {
      // Isolate kill (Tier B) is CI-gated separately; fleet Tier C is a different harness.
      // This arm stays skipped here so the comparison board stays path-filterable without celld.
      return {
        armId: "clawql-program-celld" as const,
        status: "skipped" as const,
        honesty:
          "ProgramCellDO isolate kill is Tier B (`smoke-program-cell-kill.sh`). Fleet peer resume is Tier C (`smoke-program-cell-fleet-kill.sh`). Not inlined into this Node board.",
        modes: [],
      } satisfies ArmResult;
    }),
};
