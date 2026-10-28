/**
 * Durability comparison board types.
 * This board measures **crash during an outside write** (one of several crash points).
 * See docs/benchmarks/durability-proof/COMPARISON.md.
 */

import { Effect } from "effect";

export type UpstreamMode = "idempotent" | "non_idempotent";

/**
 * How the agent behaves after an interrupted / unknown outside write.
 * - structural: ClawQL gate — retry refused regardless of model intent
 * - never-retry / always-retry: scripted faux agent
 * - real-model: live LLM (env-gated)
 */
export type AgentPolicy = "structural" | "never-retry" | "always-retry" | "real-model";

export type ArmId =
  | "clawql-file-journal"
  | "clawql-always-retry"
  | "clawql-check-then-decide"
  | "clawql-program-celld"
  | "naive-retry"
  | "pi-durable-never-retry"
  | "pi-durable-always-retry"
  | "pi-durable-real-model"
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
  /** Trials where recovery left the outcome unknown / tool interrupted (same class of problem). */
  readonly interruptedOrUnknown: number;
  /**
   * Trials where the outside write landed exactly once **and** the task finished
   * with a known success (not interrupted / unknown).
   */
  readonly completedExactlyOnce: number;
  /** @deprecated Prefer interruptedOrUnknown — kept for older evidence readers. */
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
  readonly interruptedOrUnknown: number;
  readonly completedExactlyOnce: number;
  /** @deprecated Prefer interruptedOrUnknown. */
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
  readonly agentPolicy?: AgentPolicy;
  readonly modes: readonly ArmModeResult[];
};

export type ComparisonEvidence = {
  readonly kind: "durability-comparison-crash-during-outside-write";
  readonly crashPoint: "outside_write_in_flight";
  readonly crashPointNote: string;
  readonly otherCrashPointsNotMeasured: readonly CrashPointId[];
  readonly measuredAt: string;
  readonly metric: "duplicates + interrupted_or_unknown + completed_exactly_once; both upstream modes; agent policies";
  readonly honesty: string;
  readonly arms: readonly ArmResult[];
  /** ClawQL structural arms: harnessValid and zero duplicates in both modes. */
  readonly clawqlAtMostOnce: boolean;
};

export type DurabilityArm = {
  readonly id: ArmId;
  readonly run: (input: { readonly n: number }) => Effect.Effect<ArmResult>;
};
