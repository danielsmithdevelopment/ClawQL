/**
 * Durability comparison board types (dual columns × upstream modes × arms).
 * Schema v2: runtime/version + intent-on-resume + call-verified-sent.
 * See docs/benchmarks/durability-proof/COMPARISON.md.
 */

import { Effect } from "effect";

export type UpstreamMode = "idempotent" | "non_idempotent" | "lookup_by_reference";

/** Kill / scenario locus. Existing cells keep duplicates/unknown/completed-once. */
export type CrashPhase =
  | "before_intent"
  | "after_intent_before_call"
  | "during_call"
  | "after_call_before_journal"
  | "idle"
  | "wedged_owner"
  | "stale_owner"
  | "lost_ack";

export type ArmId =
  | "clawql-file-journal"
  | "clawql-program-celld"
  | "naive-retry"
  | "pi-durable"
  | "golem"
  | "pi-durable+clawql"
  | "golem+clawql";

export type ArmRunStatus =
  | "measured"
  | "pending_invite"
  | "skipped"
  | "failed"
  | "superseded";

export type ComparisonTrial = {
  readonly i: number;
  readonly ok: boolean;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly lost: number;
  readonly uniqueWriteEffects: number;
  /** Journal/intent still visible after resume (new metric from mid-flight bug). */
  readonly intentPresentOnResume: number;
  /** Mock upstream saw the call in flight before the kill. */
  readonly callVerifiedSent: number;
  readonly childSignal: string | null;
  readonly detail: string;
};

export type ArmModeResult = {
  readonly upstreamMode: UpstreamMode;
  readonly n: number;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly lost: number;
  readonly uniqueWriteEffects: number;
  readonly intentPresentOnResume: number;
  readonly callVerifiedSent: number;
  readonly trialsOk: number;
  readonly trialsFailed: number;
  readonly boardPass: boolean;
  readonly trials: readonly ComparisonTrial[];
};

export type ArmResult = {
  readonly armId: ArmId;
  readonly status: ArmRunStatus;
  /** Runtime that produced the numbers — required for every measured arm. */
  readonly runtime: string | null;
  readonly runtimeVersion: string | null;
  readonly crashPhase: CrashPhase | null;
  readonly honesty: string;
  readonly modes: readonly ArmModeResult[];
  /** When status=superseded, points at the tip package row that replaces this arm. */
  readonly supersededBy?: string | null;
};

export type ComparisonEvidence = {
  readonly kind: "durability-comparison-kill-mid-write";
  readonly schemaVersion: 2;
  readonly packageId: string;
  readonly measuredAt: string;
  readonly metric: "duplicates + outcome_unknown (+ lost) + intentPresentOnResume + callVerifiedSent; both upstream modes";
  readonly honesty: string;
  readonly tipRuntime: string;
  readonly tipRuntimeVersion: string;
  readonly arms: readonly ArmResult[];
  readonly clawqlBoardPass: boolean;
};

export type DurabilityArm = {
  readonly id: ArmId;
  readonly run: (input: { readonly n: number }) => Effect.Effect<ArmResult>;
};

/** Regenerable package manifest (one commit for the whole tip package). */
export type ComparisonPackageManifest = {
  readonly kind: "durability-comparison-package";
  readonly schemaVersion: 2;
  readonly packageId: string;
  readonly tipRuntime: string;
  readonly tipRuntimeVersion: string;
  readonly generatedAt: string;
  readonly order: readonly string[];
  readonly columns: readonly string[];
  readonly boardEvidence: string;
  readonly fleetTipEvidence: readonly {
    readonly path: string;
    readonly role: string;
    readonly celldBinaryVersion: string | null;
    readonly status: string;
  }[];
  readonly superseded: readonly {
    readonly path: string;
    readonly reason: string;
  }[];
  readonly expansionPilots: readonly {
    readonly id: string;
    readonly status: "planned" | "pilot_n50" | "measured" | "na";
    readonly arms: readonly string[];
    readonly nPilot: number;
    readonly note: string;
  }[];
};
