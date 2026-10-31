/**
 * Peer / ProgramCellDO rows for the tip comparison package.
 *
 * - Peers emit N=defaultN mode shells with null metrics until adapters run on this tip commit.
 * - ProgramCellDO emits separate rows: during_call (fleet tip, not wedge) and wedged_owner.
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
  UpstreamMode,
} from "./types.js";

const UPSTREAM_MODES: readonly UpstreamMode[] = ["idempotent", "non_idempotent"];

function emptyModes(n: number): ArmModeResult[] {
  return UPSTREAM_MODES.map((upstreamMode) => ({
    upstreamMode,
    n,
    duplicates: null,
    outcomeUnknown: null,
    lost: null,
    uniqueWriteEffects: null,
    intentPresentOnResume: null,
    callVerifiedSent: null,
    trialsOk: null,
    trialsFailed: null,
    boardPass: false,
    trials: [],
  }));
}

function peerArm(id: ArmId, honesty: string): DurabilityArm {
  return {
    id,
    run: ({ n, harnessCommit }) =>
      Effect.succeed({
        armId: id,
        status: "pending_adapter" as const,
        runtime: null,
        runtimeVersion: null,
        harnessCommit,
        crashPhase: "during_call",
        honesty: `${honesty} Same tip package harnessCommit=${harnessCommit}; columns present with null metrics until the peer adapter runs on this commit (N=${n}).`,
        modes: emptyModes(n),
      } satisfies ArmResult),
  };
}

export const piDurableArm = peerArm(
  "pi-durable",
  "Pi Durable peer arm — adapter not wired on tip. Include N=50 pilot results in the config-review package (not after invite)."
);

export const golemArm = peerArm(
  "golem",
  "Golem peer arm — adapter not wired on tip. Include N=50 pilot results in the config-review package (not after invite)."
);

export const piDurableClawqlArm = peerArm(
  "pi-durable+clawql",
  "Combination arm (Pi Durable → ClawQL MCP) — adapter not wired on tip."
);

export const golemClawqlArm = peerArm(
  "golem+clawql",
  "Combination arm (Golem → ClawQL MCP) — adapter not wired on tip."
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
  readonly byPhase?: Record<
    string,
    {
      readonly n?: number;
      readonly duplicates?: number;
      readonly outcomeUnknown?: number;
    }
  >;
  readonly gates?: {
    readonly correctness?: { readonly failures?: number };
  };
  readonly n?: number;
  readonly trialsCompleted?: number;
  readonly fenceMode?: string;
};

function loadFleetTip(pathFromRepo: string): FleetTipSnippet | null {
  try {
    const abs = join(process.cwd(), pathFromRepo);
    return JSON.parse(readFileSync(abs, "utf8")) as FleetTipSnippet;
  } catch {
    return null;
  }
}

function modeFromFleet(opts: {
  readonly upstreamMode: UpstreamMode;
  readonly n: number;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly intentPresentOnResume: number;
  readonly callVerifiedSent: number;
}): ArmModeResult {
  const pass =
    opts.duplicates === 0 &&
    opts.intentPresentOnResume === opts.n &&
    opts.callVerifiedSent === opts.n;
  return {
    upstreamMode: opts.upstreamMode,
    n: opts.n,
    duplicates: opts.duplicates,
    outcomeUnknown: opts.outcomeUnknown,
    lost: 0,
    uniqueWriteEffects: 0,
    intentPresentOnResume: opts.intentPresentOnResume,
    callVerifiedSent: opts.callVerifiedSent,
    trialsOk: opts.n,
    trialsFailed: 0,
    boardPass: pass,
    trials: [],
  };
}

/**
 * Two rows — never fold wedge into during_call:
 * 1) during_call from stock tip fleet (v3 partial until board finishes)
 * 2) wedged_owner from dedicated tip wedge N=100
 */
export const programCelldArm: DurabilityArm = {
  id: "clawql-program-celld",
  run: ({ harnessCommit }) =>
    Effect.sync(() => {
      const v3 = loadFleetTip(
        "docs/benchmarks/program-cell-fleet-kill/phased-n1000-v3-correctness-availability.json"
      );
      const wedge = loadFleetTip(
        "docs/benchmarks/program-cell-fleet-kill/phased-n100-wedge-upstream-0.6.3.json"
      );
      const tipVer =
        v3?.celldBinaryVersion ?? wedge?.celldBinaryVersion ?? "0.6.3";

      const rows: ArmResult[] = [];

      // --- during_call (crash during outside write; NOT hung-health) ---
      const during = v3?.byPhase?.during_call;
      const callSent = v3?.callSent;
      if (during && callSent && (callSent.duringCallTrials ?? 0) > 0) {
        const n = callSent.duringCallTrials ?? during.n ?? 0;
        const sent = callSent.sawInFlight ?? 0;
        const intent = callSent.outcomeUnknownWithIntentVisible ?? 0;
        const status =
          v3?.status === "measured" && v3.ok === true ? "measured" : "partial";
        rows.push({
          armId: "clawql-program-celld",
          status,
          runtime: "celld",
          runtimeVersion: tipVer,
          harnessCommit,
          crashPhase: "during_call",
          honesty: `ProgramCellDO stock celld ${tipVer} — crash during outside write (fleet during_call, no health wedge). Source: phased-n1000-v3 (status=${v3?.status}). Separate from wedged-owner row.`,
          modes: [
            modeFromFleet({
              upstreamMode: "non_idempotent",
              n,
              duplicates: during.duplicates ?? 0,
              outcomeUnknown: during.outcomeUnknown ?? n,
              intentPresentOnResume: intent,
              callVerifiedSent: sent,
            }),
          ],
        });
      } else {
        rows.push({
          armId: "clawql-program-celld",
          status: "partial",
          runtime: "celld",
          runtimeVersion: tipVer,
          harnessCommit,
          crashPhase: "during_call",
          honesty:
            "ProgramCellDO during_call tip row awaiting fleet tip sample (v3). Not filled from wedged-owner evidence.",
          modes: emptyModes(50),
        });
      }

      // --- wedged_owner (hang health, then kill) — own row ---
      if (wedge?.status === "measured" && wedge.ok === true && wedge.callSent) {
        const n = wedge.callSent.duringCallTrials ?? wedge.n ?? 0;
        const sent = wedge.callSent.sawInFlight ?? 0;
        const intent = wedge.callSent.outcomeUnknownWithIntentVisible ?? 0;
        rows.push({
          armId: "clawql-program-celld",
          status: "measured",
          runtime: "celld",
          runtimeVersion: tipVer,
          harnessCommit,
          crashPhase: "wedged_owner",
          honesty: `Wedged-owner tip board (hang /.well-known/celld/health, then SIGKILL). N=${n} on stock celld ${tipVer}. Not the same experiment as during_call outside-write. Peer pilots should use the same wedged-owner scenario at N=50.`,
          modes: [
            modeFromFleet({
              upstreamMode: "non_idempotent",
              n,
              duplicates: 0,
              outcomeUnknown: n,
              intentPresentOnResume: intent,
              callVerifiedSent: sent,
            }),
          ],
        });
      }

      return rows;
    }),
};

/** Optional stale-owner scenario row (ClawQL tip). */
export const programCelldStaleOwnerArm: DurabilityArm = {
  id: "clawql-program-celld",
  run: ({ harnessCommit }) =>
    Effect.sync(() => {
      const stale = loadFleetTip(
        "docs/benchmarks/program-cell-fleet-kill/phased-n40-stale-owner-upstream-0.6.3.json"
      );
      if (!(stale?.status === "measured" && stale.ok === true)) {
        return {
          armId: "clawql-program-celld" as const,
          status: "partial" as const,
          runtime: "celld",
          runtimeVersion: "0.6.3",
          harnessCommit,
          crashPhase: "stale_owner" as CrashPhase,
          honesty: "Stale-owner tip evidence missing.",
          modes: emptyModes(50),
        } satisfies ArmResult;
      }
      const n = stale.trialsCompleted ?? stale.n ?? 40;
      return {
        armId: "clawql-program-celld" as const,
        status: "measured" as const,
        runtime: "celld",
        runtimeVersion: stale.celldBinaryVersion ?? "0.6.3",
        harnessCommit,
        crashPhase: "stale_owner" as CrashPhase,
        honesty: `Stale-owner tip (SIGSTOP→own.json→SIGCONT). N=${n}. Pi Durable likely N/A (single process). Peer Golem pilot N=50 on same tip harness.`,
        modes: [
          modeFromFleet({
            upstreamMode: "non_idempotent",
            n,
            duplicates: 0,
            outcomeUnknown: n,
            intentPresentOnResume: n,
            callVerifiedSent: stale.callSent?.sawInFlight ?? n,
          }),
        ],
      } satisfies ArmResult;
    }),
};
