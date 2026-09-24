/**
 * §7 held-out case shapes — frontier-adjudicated ground truth for calibration gate.
 * Synthetic fixtures ship with `adjudicated: false`; productionTrusted requires all true.
 */

import type { FastDecisionCandidate, FastDecisionScore } from "../types.js";

export type HeldOutCaseSpec = {
  readonly caseId: string;
  readonly useSiteId: string;
  readonly query: string;
  readonly candidates: readonly FastDecisionCandidate[];
  readonly groundTruthCandidateId: string;
  /**
   * True only after frontier-judge (e.g. Sonnet 4.6) adjudication per §7.2.
   * Synthetic pre-registered fixtures must leave this false.
   */
  readonly adjudicated: boolean;
  readonly notes?: string;
};

export type HeldOutSuiteManifest = {
  readonly suiteId: string;
  readonly description: string;
  readonly cases: readonly HeldOutCaseSpec[];
};

export type ScoredHeldOutCase = {
  readonly caseId: string;
  readonly useSiteId: string;
  readonly groundTruthCandidateId: string;
  readonly adjudicated: boolean;
  readonly scores: readonly FastDecisionScore[];
  readonly topCandidateId?: string;
  readonly topConfidence?: number;
  readonly correct: boolean;
};

export type HeldOutValidationRunReport = {
  readonly suiteId: string;
  readonly useSiteId: string;
  readonly caseCount: number;
  readonly adjudicatedCount: number;
  readonly rawAccuracy: number;
  readonly meanCalibrationError: number;
  readonly passedCriteria: boolean;
  readonly failureReasons: readonly string[];
  /** True only when criteria pass AND every case is frontier-adjudicated. */
  readonly productionTrusted: boolean;
  readonly cases: readonly ScoredHeldOutCase[];
};
