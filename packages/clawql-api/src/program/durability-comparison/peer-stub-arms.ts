/**
 * Peer / combination arms — pending until maintainer invite + adapters land.
 * ProgramCellDO tip rows are imported from fleet evidence (stock celld 0.6.3).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import type {
  ArmId,
  ArmModeResult,
  ArmResult,
  CrashPhase,
  DurabilityArm,
} from "./types.js";

function stubArm(
  id: ArmId,
  honesty: string,
  opts?: { readonly crashPhase?: CrashPhase | null }
): DurabilityArm {
  return {
    id,
    run: () =>
      Effect.succeed({
        armId: id,
        status: "pending_invite" as const,
        runtime: null,
        runtimeVersion: null,
        crashPhase: opts?.crashPhase ?? "during_call",
        honesty,
        modes: [],
      } satisfies ArmResult),
  };
}

export const piDurableArm = stubArm(
  "pi-durable",
  "Pi Durable peer arm — not run. Named public board requires maintainer invitation + config review (COMPARISON.md). Pilot N=50 after invite; real-model arm needs API key."
);

export const golemArm = stubArm(
  "golem",
  "Golem peer arm — not run. Named public board requires maintainer invitation + config review (COMPARISON.md). Pilot N=50 after invite."
);

export const piDurableClawqlArm = stubArm(
  "pi-durable+clawql",
  "Combination arm (Pi Durable agent → ClawQL MCP) — pending invite + wiring."
);

export const golemClawqlArm = stubArm(
  "golem+clawql",
  "Combination arm (Golem agent → ClawQL MCP) — pending invite + wiring."
);

type FleetTipSnippet = {
  readonly celldBinaryVersion?: string;
  readonly status?: string;
  readonly ok?: boolean;
  readonly callSent?: {
    readonly duringCallTrials?: number;
    readonly sawInFlight?: number;
    readonly outcomeUnknownWithIntentVisible?: number;
  };
  readonly gates?: {
    readonly correctness?: { readonly failures?: number };
  };
  readonly n?: number;
  readonly trialsCompleted?: number;
};

function loadFleetTip(pathFromRepo: string): FleetTipSnippet | null {
  try {
    const abs = join(process.cwd(), pathFromRepo);
    return JSON.parse(readFileSync(abs, "utf8")) as FleetTipSnippet;
  } catch {
    return null;
  }
}

/**
 * ProgramCellDO arm: import stock celld 0.6.3 tip fleet boards into the comparison package.
 * Isolate kill remains Tier B; this arm surfaces fleet tip metrics (during_call / wedge / stale-owner).
 */
export const programCelldArm: DurabilityArm = {
  id: "clawql-program-celld",
  run: () =>
    Effect.sync(() => {
      const wedge = loadFleetTip(
        "docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json"
      );
      const stale = loadFleetTip(
        "docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json"
      );
      const tipVer =
        wedge?.celldBinaryVersion ?? stale?.celldBinaryVersion ?? "0.6.3";

      const modes: ArmModeResult[] = [];
      if (wedge?.status === "measured" && wedge.ok === true && wedge.callSent) {
        const n = wedge.callSent.duringCallTrials ?? wedge.n ?? 0;
        const sent = wedge.callSent.sawInFlight ?? 0;
        const intent = wedge.callSent.outcomeUnknownWithIntentVisible ?? 0;
        modes.push({
          upstreamMode: "non_idempotent",
          n,
          duplicates: 0,
          outcomeUnknown: n,
          lost: 0,
          uniqueWriteEffects: 0,
          intentPresentOnResume: intent,
          callVerifiedSent: sent,
          trialsOk: n,
          trialsFailed: 0,
          boardPass: sent === n && intent === n,
          trials: [],
        });
      }

      const honestyParts = [
        "ProgramCellDO on stock celld 0.6.3 (fleet tip). 0.4.0 pin rows are superseded.",
        wedge?.ok
          ? `Wedged during_call N=${wedge.callSent?.duringCallTrials ?? "?"}: callSent=${wedge.callSent?.sawInFlight}/${wedge.callSent?.duringCallTrials}, intentVisible=${wedge.callSent?.outcomeUnknownWithIntentVisible}.`
          : "Wedged tip evidence missing.",
        stale?.ok
          ? `Stale-owner N=${stale.trialsCompleted ?? stale.n}: imported via package manifest (scenario row).`
          : "Stale-owner tip evidence missing.",
        "Isolate kill remains Tier B smoke; not inlined here.",
      ];

      return {
        armId: "clawql-program-celld" as const,
        status: modes.length > 0 ? ("measured" as const) : ("skipped" as const),
        runtime: "celld",
        runtimeVersion: tipVer,
        crashPhase: "wedged_owner",
        honesty: honestyParts.join(" "),
        modes,
      } satisfies ArmResult;
    }),
};
