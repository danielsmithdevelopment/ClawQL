/**
 * Durability comparison board types (dual columns × upstream modes × arms).
 * Schema v2: runtime/version + intent-on-resume + call-verified-sent.
 * Evidence `arms` is a list of rows keyed by (armId, crashPhase) — not unique armId.
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
  | "golem-at-least-once-sim"
  | "pi-interrupt-sim"
  | "pi-durable"
  | "golem"
  | "pi-durable+clawql"
  | "golem+clawql";

export type ArmRunStatus =
  | "measured"
  | "partial"
  | "pending_adapter"
  | "pending_invite"
  | "skipped"
  | "failed"
  | "superseded"
  | "na";

/** Metric count — null when the arm has no adapter run on this tip commit yet. */
export type MetricCount = number | null;

export type ComparisonTrial = {
  readonly i: number;
  readonly ok: boolean;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly lost: number;
  readonly uniqueWriteEffects: number;
  readonly intentPresentOnResume: number;
  readonly callVerifiedSent: number;
  readonly childSignal: string | null;
  readonly detail: string;
};

export type ArmModeResult = {
  readonly upstreamMode: UpstreamMode;
  readonly n: number;
  readonly duplicates: MetricCount;
  readonly outcomeUnknown: MetricCount;
  readonly lost: MetricCount;
  readonly uniqueWriteEffects: MetricCount;
  readonly intentPresentOnResume: MetricCount;
  readonly callVerifiedSent: MetricCount;
  readonly trialsOk: MetricCount;
  readonly trialsFailed: MetricCount;
  readonly boardPass: boolean;
  readonly trials: readonly ComparisonTrial[];
};

export type ArmResult = {
  readonly armId: ArmId;
  readonly status: ArmRunStatus;
  /** Runtime that produced the numbers — required whenever status is measured/partial. */
  readonly runtime: string | null;
  readonly runtimeVersion: string | null;
  /** Package git tip identity so peer rows share the same harness commit. */
  readonly harnessCommit: string | null;
  readonly crashPhase: CrashPhase | null;
  readonly honesty: string;
  readonly modes: readonly ArmModeResult[];
  readonly supersededBy?: string | null;
};

export type ComparisonEvidence = {
  readonly kind: "durability-comparison-kill-mid-write";
  readonly schemaVersion: 2;
  readonly packageId: string;
  readonly measuredAt: string;
  readonly harnessCommit: string;
  readonly defaultN: number;
  readonly metric: "duplicates + outcome_unknown (+ lost) + intentPresentOnResume + callVerifiedSent; both upstream modes";
  readonly honesty: string;
  readonly tipRuntime: string;
  readonly tipRuntimeVersion: string;
  /** Rows: one entry per (armId, crashPhase). Wedged-owner is never folded into during_call. */
  readonly arms: readonly ArmResult[];
  readonly clawqlBoardPass: boolean;
};

export type DurabilityArm = {
  readonly id: ArmId;
  readonly run: (input: {
    readonly n: number;
    readonly harnessCommit: string;
  }) => Effect.Effect<ArmResult | readonly ArmResult[]>;
};

export type ComparisonPackageManifest = {
  readonly kind: "durability-comparison-package";
  readonly schemaVersion: 2;
  readonly packageId: string;
  readonly tipRuntime: string;
  readonly tipRuntimeVersion: string;
  readonly harnessCommit: string;
  readonly defaultN: number;
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
    readonly status: "planned" | "pilot_n50" | "measured" | "na" | "partial";
    readonly arms: readonly string[];
    readonly nPilot: number;
    readonly note: string;
  }[];
};
