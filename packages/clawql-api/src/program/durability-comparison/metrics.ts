/**
 * Shared trial / mode aggregation for the crash-during-outside-write board.
 */

import type { ApiCapability, ArmModeResult, ComparisonTrial, UpstreamMode } from "./types.js";

export function classifyOutcome(input: {
  readonly uniqueWriteEffects: number;
  /** Extra unique effects beyond the first applied write. */
  readonly duplicates: number;
  /**
   * True when recovery left the agent without a known success/failure for the
   * outside write (ClawQL outcome_unknown, Pi tool interrupted + no confirmed finish).
   */
  readonly interruptedOrUnknown: boolean;
  /**
   * True when the task finished with a known successful charge (not merely
   * “one effect landed but outcome still unknown”).
   */
  readonly completedKnownSuccess: boolean;
}): Pick<
  ComparisonTrial,
  "duplicates" | "interruptedOrUnknown" | "completedExactlyOnce" | "outcomeUnknown"
> {
  const interruptedOrUnknown = input.interruptedOrUnknown ? 1 : 0;
  const completedExactlyOnce =
    input.uniqueWriteEffects === 1 &&
    input.duplicates === 0 &&
    input.completedKnownSuccess &&
    !input.interruptedOrUnknown
      ? 1
      : 0;
  return {
    duplicates: input.duplicates,
    interruptedOrUnknown,
    completedExactlyOnce,
    outcomeUnknown: interruptedOrUnknown,
  };
}

export function summarizeMode(
  upstreamMode: UpstreamMode,
  trials: readonly ComparisonTrial[],
  opts: {
    readonly requireZeroDuplicates?: boolean;
    readonly apiCapability: ApiCapability;
  }
): ArmModeResult {
  const n = trials.length;
  const duplicates = trials.reduce((s, t) => s + t.duplicates, 0);
  const interruptedOrUnknown = trials.reduce((s, t) => s + t.interruptedOrUnknown, 0);
  const completedExactlyOnce = trials.reduce((s, t) => s + t.completedExactlyOnce, 0);
  const outcomeUnknown = trials.reduce((s, t) => s + t.outcomeUnknown, 0);
  const lost = trials.reduce((s, t) => s + t.lost, 0);
  const uniqueWriteEffects = trials.reduce((s, t) => s + t.uniqueWriteEffects, 0);
  const trialsOk = trials.filter((t) => t.ok).length;
  const trialsFailed = n - trialsOk;
  const harnessValid = trialsFailed === 0 && (!opts.requireZeroDuplicates || duplicates === 0);
  return {
    upstreamMode,
    apiCapability: opts.apiCapability,
    n,
    duplicates,
    interruptedOrUnknown,
    completedExactlyOnce,
    outcomeUnknown,
    lost,
    uniqueWriteEffects,
    trialsOk,
    trialsFailed,
    harnessValid,
    trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
  };
}

/** Map upstream mode (+ lookup flags) to the labeled API capability. */
export function apiCapabilityFor(input: {
  readonly upstreamMode: UpstreamMode;
  readonly lookupByReference?: boolean;
  readonly lookupRace?: boolean;
}): ApiCapability {
  if (input.lookupRace) return "lookup_race";
  if (input.upstreamMode === "idempotent") return "idempotency_keys";
  if (input.lookupByReference) return "lookup_by_reference";
  return "neither";
}
