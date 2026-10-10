/**
 * §7 held-out case shapes — frontier-adjudicated ground truth for calibration gate.
 * Synthetic fixtures ship with `adjudicated: false`; productionTrusted requires all true
 * with live (non-dry-run) provenance, live gliner2, and flip-rate pass (unless opted out).
 */

import type { FastDecisionCandidate, FastDecisionScore } from "../types.js";

/** How the case got `adjudicated: true`. Dry-run never lights productionTrusted. */
export type AdjudicationKind = "dry-run" | "live";

export type HeldOutFlipRateFamily = "whitespace" | "case" | "punctuation" | "synonym";

export type HeldOutFlipRateCaseReport = {
  readonly caseId: string;
  readonly baseline: string | null;
  readonly perturbations: number;
  readonly flips: number;
  readonly flipRate: number;
  readonly passed: boolean;
};

export type HeldOutFlipRateReport = {
  readonly maxFlipRate: number;
  readonly families: readonly HeldOutFlipRateFamily[];
  readonly caseCount: number;
  readonly passed: boolean;
  /** True when CLAWQL_FLIP_RATE_GATE disables the gate (does not block productionTrusted). */
  readonly skipped: boolean;
  readonly reports: readonly HeldOutFlipRateCaseReport[];
};

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
   * scorerBackend is live `gliner2`, and flip-rate gate passes (or is opted out
   * via `CLAWQL_FLIP_RATE_GATE=0`).
   */
  readonly productionTrusted: boolean;
  /** Flip-rate / perturbation robustness report (skipped when gate opted out). */
  readonly flipRate: HeldOutFlipRateReport;
  readonly cases: readonly ScoredHeldOutCase[];
};
