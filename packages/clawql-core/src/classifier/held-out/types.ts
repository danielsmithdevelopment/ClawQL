/**
 * §7 held-out case shapes — frontier-adjudicated ground truth for calibration gate.
 * Synthetic fixtures ship with `adjudicated: false`; productionTrusted requires all true
 * with live (non-dry-run) provenance.
 */

import type { FastDecisionCandidate, FastDecisionScore } from "../types.js";

/** How the case got `adjudicated: true`. Dry-run never lights productionTrusted. */
export type AdjudicationKind = "dry-run" | "live";

export type HeldOutCaseSpec = {
  readonly caseId: string;
  readonly useSiteId: string;
  readonly query: string;
  readonly candidates: readonly FastDecisionCandidate[];
  readonly groundTruthCandidateId: string;
  /**
   * True only after frontier-judge (e.g. Sonnet 4.6) adjudication per §7.2.
   * Synthetic pre-registered fixtures must leave this false.
   * Dry-run may set this true for wiring, but must set `adjudicationKind: "dry-run"`.
   */
  readonly adjudicated: boolean;
  /** Present when adjudicated; omitted on raw fixtures. */
  readonly adjudicationKind?: AdjudicationKind;
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
  readonly adjudicationKind?: AdjudicationKind;
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
  /** Scorer `backendId()` at validation time (e.g. `gliner2`, `gliner2-stub`). */
  readonly scorerBackend: string;
  /**
   * True only when criteria pass, every case has `adjudicationKind: "live"`,
   * and scorerBackend is live `gliner2`.
   */
  readonly productionTrusted: boolean;
  readonly cases: readonly ScoredHeldOutCase[];
};
