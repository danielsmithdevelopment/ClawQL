/**
 * Durability comparison board types.
 * This board measures **crash during an outside write** (one of several crash points).
 * See docs/benchmarks/durability-proof/COMPARISON.md.
 */

import { Effect } from "effect";

export type UpstreamMode = "idempotent" | "non_idempotent";

/**
 * What the remote API offers for recovering an in-flight write.
 * Label every board row with exactly one of these — the condition the numbers depend on.
 */
export type ApiCapability = "idempotency_keys" | "lookup_by_reference" | "neither" | "lookup_race"; // lookup capable, but original may still be in flight (race probe)

/**
 * How the agent behaves after an interrupted / unknown outside write.
 * - structural: ClawQL gate — retry refused regardless of model intent
 * - never-retry / always-retry: scripted faux agent
 * - real-model: live LLM (env-gated)
 */
export type AgentPolicy = "structural" | "never-retry" | "always-retry" | "real-model";

/** Peer framing: measured out of the box, not a custom reconciliation layer. */
export type PeerFraming = "out_of_the_box" | "clawql_structural" | "combination";

export type ArmId =
  | "clawql-file-journal"
  | "clawql-always-retry"
  | "clawql-check-then-decide"
  | "clawql-check-then-decide-race"
  | "clawql-program-celld"
  | "naive-retry"
  | "pi-durable-never-retry"
  | "pi-durable-always-retry"
  | "pi-durable-real-model"
  | "pi-durable"
  | "golem"
  | "pi-durable+clawql"
  | "golem+clawql";

/** Board trial event for TLA+ trace checking (optional export). */
export type TrialTraceEvent = {
  readonly t: string;
  readonly kind:
    | "intent_journaled"
    | "request_sent"
    | "request_paused"
    | "request_applied"
    | "request_released"
    | "crashed"
    | "resumed"
    | "lookup"
    | "reconciled"
    | "outcome_unknown"
    | "safe_resend"
    | "retry_refused"
    | "agent_retry";
  readonly reference?: string;
  readonly definitive?: boolean;
  readonly found?: boolean;
  readonly detail?: string;
};

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
  /** Optional event log for TLA+ trace conformance (DURABILITY_COMPARISON_TRACE=1). */
  readonly events?: readonly TrialTraceEvent[];
};

export type ArmModeResult = {
  readonly upstreamMode: UpstreamMode;
  /** Which remote-API recovery condition this mode exercises. */
  readonly apiCapability: ApiCapability;
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
  /** Peers: measured out of the box (no custom reconciliation). */
  readonly peerFraming?: PeerFraming;
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
