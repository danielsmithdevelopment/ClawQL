/**
 * Durability comparison board types (dual columns × upstream modes × arms).
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

export type ArmRunStatus = "measured" | "pending_invite" | "skipped" | "failed";

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
  readonly boardPass: boolean;
  readonly trials: readonly ComparisonTrial[];
};

export type ArmResult = {
  readonly armId: ArmId;
  readonly status: ArmRunStatus;
  readonly honesty: string;
  readonly modes: readonly ArmModeResult[];
};

export type ComparisonEvidence = {
  readonly kind: "durability-comparison-kill-mid-write";
  readonly measuredAt: string;
  readonly metric: "duplicates + outcome_unknown (+ lost); both upstream modes";
  readonly honesty: string;
  readonly arms: readonly ArmResult[];
  readonly clawqlBoardPass: boolean;
};

export type DurabilityArm = {
  readonly id: ArmId;
  readonly run: (input: { readonly n: number }) => Effect.Effect<ArmResult>;
};
