/**
 * Peer / combination arms — live Golem + Pi Durable drivers (env-gated) + celld skip.
 */

import { Effect } from "effect";
import {
  golemArm,
  golemClawqlArm,
  piDurableArm,
  piDurableClawqlArm,
} from "./peer-live-arms.js";
import type { ArmResult, DurabilityArm } from "./types.js";

export { golemArm, golemClawqlArm, piDurableArm, piDurableClawqlArm };

export const programCelldArm: DurabilityArm = {
  id: "clawql-program-celld",
  run: () =>
    Effect.sync(() => {
      return {
        armId: "clawql-program-celld" as const,
        status: "skipped" as const,
        honesty:
          "ProgramCellDO isolate kill is Tier B (`smoke-program-cell-kill.sh`). Fleet peer resume is Tier C (`smoke-program-cell-fleet-kill.sh`). Not inlined into this Node board.",
        modes: [],
      } satisfies ArmResult;
    }),
};
