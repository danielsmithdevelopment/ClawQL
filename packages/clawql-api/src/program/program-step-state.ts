/**
 * Claim-path §1 — **State preserved**: after crash + resume, program step
 * outcomes (and the aggregated program result) match a no-crash baseline.
 *
 * Digests omit per-run fields (`programId`, `replayed`) so a resumed journal
 * path can be compared to a plain plan-runner run of the same source.
 */

import { Context, Effect, Layer } from "effect";
import { canonicalizeForHash } from "../pending/args-hash.js";
import type { ProgramCallRecord } from "./program-runner.js";

/** Per-step slice used for baseline-vs-resume equality (claim-path §1). */
export type ProgramStepStateSlice = {
  readonly index: number;
  readonly tool: ProgramCallRecord["tool"];
  readonly operationId?: string;
  readonly ok: boolean;
  readonly status?: string;
  readonly error?: string;
  readonly resultPreview?: string;
};

export type ProgramStepStateSnapshot = {
  readonly steps: readonly ProgramStepStateSlice[];
  /** Canonical digest of the program-level result (null/undefined → null). */
  readonly resultDigest: string | null;
};

export type ProgramStepStateCompareInput = {
  readonly baselineCalls: readonly ProgramCallRecord[];
  readonly observedCalls: readonly ProgramCallRecord[];
  readonly baselineResult?: unknown;
  readonly observedResult?: unknown;
};

export type ProgramStepStateCompare = {
  /** True when every step slice and the program result digest match. */
  readonly preserved: boolean;
  readonly stepsMatch: boolean;
  readonly resultMatch: boolean;
  readonly mismatchIndexes: readonly number[];
  readonly baseline: ProgramStepStateSnapshot;
  readonly observed: ProgramStepStateSnapshot;
  readonly meaning: string;
};

const MEANING =
  "claim-path §1 — program step outcomes after resume match the no-crash baseline (index/tool/op/ok/status/error/resultPreview + program result digest)";

function projectSteps(calls: readonly ProgramCallRecord[]): readonly ProgramStepStateSlice[] {
  return calls.map((c) => ({
    index: c.index,
    tool: c.tool,
    ...(c.operationId !== undefined ? { operationId: c.operationId } : {}),
    ok: c.ok,
    ...(c.status !== undefined ? { status: c.status } : {}),
    ...(c.error !== undefined ? { error: c.error } : {}),
    ...(c.resultPreview !== undefined ? { resultPreview: c.resultPreview } : {}),
  }));
}

function resultDigest(result: unknown): string | null {
  if (result === undefined || result === null) return null;
  return canonicalizeForHash(result);
}

function snapshotFrom(
  calls: readonly ProgramCallRecord[],
  result: unknown
): ProgramStepStateSnapshot {
  return {
    steps: projectSteps(calls),
    resultDigest: resultDigest(result),
  };
}

function mismatchIndexes(
  baseline: readonly ProgramStepStateSlice[],
  observed: readonly ProgramStepStateSlice[]
): readonly number[] {
  const out: number[] = [];
  const n = Math.max(baseline.length, observed.length);
  for (let i = 0; i < n; i++) {
    const a = baseline[i];
    const b = observed[i];
    if (a === undefined || b === undefined) {
      out.push(i);
      continue;
    }
    if (canonicalizeForHash(a) !== canonicalizeForHash(b)) out.push(i);
  }
  return out;
}

function compareSync(input: ProgramStepStateCompareInput): ProgramStepStateCompare {
  const baseline = snapshotFrom(input.baselineCalls, input.baselineResult);
  const observed = snapshotFrom(input.observedCalls, input.observedResult);
  const mismatches = mismatchIndexes(baseline.steps, observed.steps);
  const stepsMatch = mismatches.length === 0 && baseline.steps.length === observed.steps.length;
  const resultMatch = baseline.resultDigest === observed.resultDigest;
  return {
    preserved: stepsMatch && resultMatch,
    stepsMatch,
    resultMatch,
    mismatchIndexes: mismatches,
    baseline,
    observed,
    meaning: MEANING,
  };
}

/** Project call records into the comparable step-state slices. */
export const projectProgramStepStateEffect = (
  calls: readonly ProgramCallRecord[]
): Effect.Effect<readonly ProgramStepStateSlice[]> => Effect.sync(() => projectSteps(calls));

/** Compare a no-crash baseline to an observed (usually resumed) program path. */
export const compareProgramStepStateEffect = (
  input: ProgramStepStateCompareInput
): Effect.Effect<ProgramStepStateCompare> => Effect.sync(() => compareSync(input));

export class ProgramStepStateService extends Context.Service<
  ProgramStepStateService,
  {
    readonly project: (
      calls: readonly ProgramCallRecord[]
    ) => Effect.Effect<readonly ProgramStepStateSlice[]>;
    readonly compare: (
      input: ProgramStepStateCompareInput
    ) => Effect.Effect<ProgramStepStateCompare>;
  }
>()("clawql/ProgramStepStateService") {}

export const ProgramStepStateLive = Layer.succeed(
  ProgramStepStateService,
  ProgramStepStateService.of({
    project: projectProgramStepStateEffect,
    compare: compareProgramStepStateEffect,
  })
);
