/**
 * Durability comparison board types.
 * This board measures **crash during an outside write** (one of several crash points).
 * See docs/benchmarks/durability-proof/COMPARISON.md.
 */

import { Effect } from "effect";

export type UpstreamMode = "idempotent" | "non_idempotent";

export type ArmId =
  | "clawql-file-journal"
  | "clawql-program-celld"
  | "naive-retry"
  | "pi-durable"
  | "golem"
  | "pi-durable+clawql"
  | "golem+clawql";

export type ArmRunStatus = "measured" | "pilot_standin" | "pending_invite" | "skipped" | "failed";

/** Crash-point rows for a full durability comparison (this board ships outside-write only). */
export type CrashPointId =
  | "outside_write_in_flight"
  | "before_write_sent"
  | "after_write_acked"
  | "idle_between_steps"
  | "during_model_tool_round";

export type ComparisonTrial = {
  readonly i: number;
  readonly ok: boolean;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly lost: number;
  readonly uniqueWriteEffects: number;
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
  readonly trialsOk: number;
  readonly trialsFailed: number;
  /**
   * Harness ran each trial to a valid protocol outcome for that arm
   * (not “the arm behaved well on the product metric”).
   */
  readonly harnessValid: boolean;
  readonly trials: readonly ComparisonTrial[];
};

export type ArmResult = {
  readonly armId: ArmId;
  readonly status: ArmRunStatus;
  readonly honesty: string;
  /** Pinned versions / config string for maintainer review. */
  readonly config?: string;
  readonly modes: readonly ArmModeResult[];
};

export type ComparisonEvidence = {
  readonly kind: "durability-comparison-crash-during-outside-write";
  readonly crashPoint: "outside_write_in_flight";
  readonly crashPointNote: string;
  readonly otherCrashPointsNotMeasured: readonly CrashPointId[];
  readonly measuredAt: string;
  readonly metric: "duplicates + outcome_unknown (+ lost); both upstream modes";
  readonly honesty: string;
  readonly arms: readonly ArmResult[];
  /** ClawQL file-journal: harnessValid and zero duplicates in both modes. */
  readonly clawqlAtMostOnce: boolean;
};

export type DurabilityArm = {
  readonly id: ArmId;
  readonly run: (input: { readonly n: number }) => Effect.Effect<ArmResult>;
};
