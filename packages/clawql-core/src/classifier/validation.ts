/**
 * Section 7 validation harness — correctness + calibration primary gate.
 * Cost/latency (§6.8) is secondary and must not run before this passes.
 */

import { Context, Effect, Layer } from "effect";
import type { FastDecisionScore } from "./types.js";

export type HeldOutCase = {
  readonly caseId: string;
  /** Ground truth candidate id (frontier-judge adjudicated). */
  readonly groundTruthCandidateId: string;
  readonly scores: readonly FastDecisionScore[];
};

export type CalibrationBucket = {
  readonly lo: number;
  readonly hi: number;
  readonly count: number;
  readonly accuracy: number;
  /** Absolute gap |accuracy - midConfidence|. */
  readonly calibrationError: number;
};

export type CorrectnessCalibrationReport = {
  readonly useSiteId: string;
  readonly caseCount: number;
  readonly rawAccuracy: number;
  readonly buckets: readonly CalibrationBucket[];
  /** Mean absolute calibration error across non-empty buckets. */
  readonly meanCalibrationError: number;
  readonly passed: boolean;
  readonly failureReasons: readonly string[];
};

export type ValidationCriteria = {
  readonly minAccuracy: number;
  readonly maxMeanCalibrationError: number;
  readonly minCases: number;
};

export const DEFAULT_VALIDATION_CRITERIA: ValidationCriteria = {
  minAccuracy: 0.7,
  maxMeanCalibrationError: 0.15,
  minCases: 1,
};

const DEFAULT_BUCKETS: readonly { readonly lo: number; readonly hi: number }[] = [
  { lo: 0.5, hi: 0.6 },
  { lo: 0.6, hi: 0.7 },
  { lo: 0.7, hi: 0.8 },
  { lo: 0.8, hi: 0.9 },
  { lo: 0.9, hi: 1.0001 },
];

export class FastDecisionValidationService extends Context.Tag(
  "clawql/FastDecisionValidationService"
)<
  FastDecisionValidationService,
  {
    readonly evaluate: (
      useSiteId: string,
      cases: readonly HeldOutCase[],
      criteria?: ValidationCriteria
    ) => Effect.Effect<CorrectnessCalibrationReport>;
  }
>() {}

function pickTop(scores: readonly FastDecisionScore[]): FastDecisionScore | undefined {
  if (scores.length === 0) return undefined;
  return [...scores].sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * True when every score is ≤0 — stable sort would otherwise pick candidate[0]
 * as "top" and invent accuracy/calibration from zero-signal rankings.
 */
function isZeroSignal(scores: readonly FastDecisionScore[]): boolean {
  return scores.length > 0 && scores.every((s) => s.confidence <= 0);
}

export function evaluateCorrectnessAndCalibration(
  useSiteId: string,
  cases: readonly HeldOutCase[],
  criteria: ValidationCriteria = DEFAULT_VALIDATION_CRITERIA
): CorrectnessCalibrationReport {
  const failureReasons: string[] = [];
  if (cases.length < criteria.minCases) {
    failureReasons.push(`need ≥${criteria.minCases} held-out cases, got ${cases.length}`);
  }

  let correct = 0;
  let scoredCases = 0;
  let abstainedZeroSignal = 0;
  const bucketHits = DEFAULT_BUCKETS.map(() => ({ correct: 0, total: 0 }));

  for (const c of cases) {
    if (c.scores.length === 0) continue;
    // Abstain on all-zero / non-positive confidences — do not treat fixture
    // order as a correct ranking.
    if (isZeroSignal(c.scores)) {
      abstainedZeroSignal++;
      continue;
    }
    const top = pickTop(c.scores);
    if (!top || top.confidence <= 0) {
      abstainedZeroSignal++;
      continue;
    }
    scoredCases++;
    const isCorrect = top.candidateId === c.groundTruthCandidateId;
    if (isCorrect) correct++;
    const conf = top.confidence;
    for (let i = 0; i < DEFAULT_BUCKETS.length; i++) {
      const b = DEFAULT_BUCKETS[i]!;
      if (conf >= b.lo && conf < b.hi) {
        bucketHits[i]!.total++;
        if (isCorrect) bucketHits[i]!.correct++;
        break;
      }
    }
  }

  const rawAccuracy = cases.length === 0 ? 0 : correct / cases.length;
  const buckets: CalibrationBucket[] = DEFAULT_BUCKETS.map((b, i) => {
    const hit = bucketHits[i]!;
    const accuracy = hit.total === 0 ? 0 : hit.correct / hit.total;
    const mid = (b.lo + Math.min(b.hi, 1)) / 2;
    return {
      lo: b.lo,
      hi: Math.min(b.hi, 1),
      count: hit.total,
      accuracy,
      calibrationError: hit.total === 0 ? 0 : Math.abs(accuracy - mid),
    };
  });

  const nonEmpty = buckets.filter((b) => b.count > 0);
  const meanCalibrationError =
    nonEmpty.length === 0
      ? 1
      : nonEmpty.reduce((s, b) => s + b.calibrationError, 0) / nonEmpty.length;

  if (abstainedZeroSignal > 0) {
    failureReasons.push(
      `zeroSignalAbstain ${abstainedZeroSignal}/${cases.length} (all-zero / non-positive confidences are not ranked)`
    );
  }
  if (nonEmpty.length === 0) {
    failureReasons.push(
      `noCalibratableScores: no top confidences landed in buckets ≥0.5 (scoredCases=${scoredCases}; sentinel meanCalibrationError=1)`
    );
  }
  if (rawAccuracy < criteria.minAccuracy) {
    failureReasons.push(
      `rawAccuracy ${rawAccuracy.toFixed(3)} < minAccuracy ${criteria.minAccuracy}`
    );
  }
  if (meanCalibrationError > criteria.maxMeanCalibrationError) {
    failureReasons.push(
      `meanCalibrationError ${meanCalibrationError.toFixed(3)} > max ${criteria.maxMeanCalibrationError}`
    );
  }

  return {
    useSiteId,
    caseCount: cases.length,
    rawAccuracy,
    buckets,
    meanCalibrationError,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}

export const FastDecisionValidationLive: Layer.Layer<FastDecisionValidationService> = Layer.succeed(
  FastDecisionValidationService,
  {
    evaluate: (useSiteId, cases, criteria) =>
      Effect.sync(() =>
        evaluateCorrectnessAndCalibration(useSiteId, cases, criteria ?? DEFAULT_VALIDATION_CRITERIA)
      ),
  }
);
