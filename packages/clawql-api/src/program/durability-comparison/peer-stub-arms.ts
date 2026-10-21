/**
 * Peer / combination arms — pending until maintainer invite + adapters land.
 */

import { Effect } from "effect";
import type { ArmId, ArmResult, DurabilityArm } from "./types.js";

function stubArm(id: ArmId, honesty: string): DurabilityArm {
  return {
    id,
    run: () =>
      Effect.succeed({
        armId: id,
        status: "pending_invite" as const,
        honesty,
        modes: [],
      } satisfies ArmResult),
  };
}

export const piDurableArm = stubArm(
  "pi-durable",
  "Pi Durable peer arm — not run. Named public board requires maintainer invitation (COMPARISON.md)."
);

export const golemArm = stubArm(
  "golem",
  "Golem peer arm — not run. Named public board requires maintainer invitation (COMPARISON.md)."
);

export const piDurableClawqlArm = stubArm(
  "pi-durable+clawql",
  "Combination arm (Pi Durable agent → ClawQL MCP) — pending invite + wiring."
);

export const golemClawqlArm = stubArm(
  "golem+clawql",
  "Combination arm (Golem agent → ClawQL MCP) — pending invite + wiring."
);

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
