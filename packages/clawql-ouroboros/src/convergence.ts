import type { OntologyLineage, ACResult } from "./lineage.js";
import type { OntologyField } from "./seed.js";
import { DRIFT_THRESHOLD_ACCEPTABLE, type DriftBand, type DriftReport } from "./drift.js";

/** Upstream Q00 stagnation taxonomy + loop exit codes (epic #556 / #559). */
export type ConvergenceReasonCode =
  | "similarity"
  | "no_drift"
  | "oscillation"
  | "spinning"
  | "diminishing_returns"
  | "max_generations"
  | "drift_exceeded"
  | "eval_gate"
  | "ac_gate"
  | "approval_gate"
  | "regression_gate"
  | "evolution_required"
  | "validation_gate"
  | "continuing";

export interface ConvergenceSignal {
  converged: boolean;
  reason: string;
  /** Named stagnation / exit code when a detector or gate applies. */
  reason_code?: ConvergenceReasonCode;
  ontology_similarity: number;
  generation: number;
  failed_acs?: number[];
  combined_drift?: number;
  drift_band?: DriftBand;
}

export interface RegressionResult {
  has_regressions: boolean;
  regressed_ac_indices: number[];
}

export interface ConvergenceConfig {
  convergenceThreshold: number;
  stagnationWindow: number;
  minGenerations: number;
  maxGenerations: number;
  enableOscillationDetection: boolean;
  /** Detect repeated execution output (upstream SPINNING). */
  enableSpinningDetection: boolean;
  /** Detect flat or declining eval scores (upstream DIMINISHING_RETURNS). */
  enableDiminishingReturnsDetection: boolean;
  /** Minimum per-generation score improvement to avoid diminishing_returns. */
  diminishingReturnsMinDelta: number;
  evalGateEnabled: boolean;
  evalMinScore: number;
  regressionGateEnabled: boolean;
  validationGateEnabled: boolean;
  /** Block converge when combined drift exceeds threshold (upstream Q00 gate). */
  driftGateEnabled: boolean;
  driftMaxCombined: number;
}

const DEFAULT_CONFIG: ConvergenceConfig = {
  convergenceThreshold: 0.95,
  stagnationWindow: 3,
  minGenerations: 2,
  maxGenerations: 30,
  enableOscillationDetection: true,
  enableSpinningDetection: true,
  enableDiminishingReturnsDetection: true,
  diminishingReturnsMinDelta: 0.01,
  evalGateEnabled: true,
  evalMinScore: 0.7,
  regressionGateEnabled: true,
  validationGateEnabled: true,
  driftGateEnabled: true,
  driftMaxCombined: DRIFT_THRESHOLD_ACCEPTABLE,
};

// ---------------------------------------------------------------------------
// RegressionDetector
// ---------------------------------------------------------------------------

export class RegressionDetector {
  /**
   * For each AC in the latest generation that failed, check whether it passed
   * in any earlier generation. Those are regressions.
   */
  detect(lineage: OntologyLineage): RegressionResult {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    if (completed.length < 2) {
      return { has_regressions: false, regressed_ac_indices: [] };
    }

    const latest = completed[completed.length - 1];
    const prior = completed.slice(0, -1);

    const latestAcs: ACResult[] = latest.evaluation_summary?.ac_results ?? [];
    const failedNow = latestAcs.filter((ac) => !ac.passed);

    if (failedNow.length === 0) {
      return { has_regressions: false, regressed_ac_indices: [] };
    }

    const regressed: number[] = [];

    for (const failedAc of failedNow) {
      const everPassed = prior.some((gen) => {
        const match = gen.evaluation_summary?.ac_results?.find(
          (ac) => ac.ac_index === failedAc.ac_index
        );
        return match?.passed === true;
      });

      if (everPassed) {
        regressed.push(failedAc.ac_index);
      }
    }

    return {
      has_regressions: regressed.length > 0,
      regressed_ac_indices: regressed,
    };
  }
}

// ---------------------------------------------------------------------------
// Similarity helpers
// ---------------------------------------------------------------------------

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;
  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return intersectionSize / unionSize;
}

function wordOverlap(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().split(/\s+/).filter(Boolean));
  return jaccard(tokenize(a), tokenize(b));
}

function computeOntologySimilarity(
  prevFields: OntologyField[],
  currFields: OntologyField[]
): number {
  if (prevFields.length === 0 && currFields.length === 0) return 1.0;
  if (prevFields.length === 0 || currFields.length === 0) return 0.0;

  const prevNames = new Set(prevFields.map((f) => f.name));
  const currNames = new Set(currFields.map((f) => f.name));

  const nameScore = jaccard(prevNames, currNames);

  const sharedNames = [...prevNames].filter((n) => currNames.has(n));

  let typeMatches = 0;
  let descScoreSum = 0;

  for (const name of sharedNames) {
    const p = prevFields.find((f) => f.name === name)!;
    const c = currFields.find((f) => f.name === name)!;

    if (p.field_type === c.field_type) typeMatches++;
    descScoreSum += wordOverlap(p.description, c.description);
  }

  const typeScore = sharedNames.length > 0 ? typeMatches / sharedNames.length : 0;
  const descScore = sharedNames.length > 0 ? descScoreSum / sharedNames.length : 0;

  return nameScore * 0.5 + typeScore * 0.3 + descScore * 0.2;
}

function ontologyFingerprint(fields: OntologyField[]): string {
  return JSON.stringify(
    [...fields]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ name: f.name, field_type: f.field_type, required: f.required }))
  );
}

// ---------------------------------------------------------------------------
// ConvergenceCriteria
// ---------------------------------------------------------------------------

export class ConvergenceCriteria {
  readonly config: ConvergenceConfig;
  private readonly regressionDetector: RegressionDetector;

  constructor(config: Partial<ConvergenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.regressionDetector = new RegressionDetector();
  }

  evaluate(
    lineage: OntologyLineage,
    latestWonder?: { requires_evolution?: boolean },
    latestEvaluation?: { final_approved: boolean; score?: number; ac_results: ACResult[] },
    validationOutput?: string,
    latestDrift?: Pick<DriftReport, "combined_drift" | "band">
  ): ConvergenceSignal {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    const numCompleted = completed.length;
    const currentGen = lineage.current_generation;
    const evalGateFailure = this._evalGateFailure(latestEvaluation);

    if (numCompleted < this.config.minGenerations) {
      return {
        converged: false,
        reason: `Below minimum generations (${numCompleted}/${this.config.minGenerations})`,
        reason_code: "continuing",
        ontology_similarity: 0,
        generation: currentGen,
      };
    }

    const latestSim = this._latestSimilarity(lineage);

    if (latestSim >= this.config.convergenceThreshold) {
      if (evalGateFailure) {
        return {
          converged: false,
          reason: evalGateFailure.reason,
          reason_code: evalGateFailure.reason_code,
          ontology_similarity: latestSim,
          generation: currentGen,
          failed_acs: evalGateFailure.failedAcs,
        };
      }

      if (this.config.regressionGateEnabled) {
        const regression = this.regressionDetector.detect(lineage);
        if (regression.has_regressions) {
          return {
            converged: false,
            reason: `Regression gate: ACs [${regression.regressed_ac_indices.join(", ")}] regressed from prior passing state`,
            reason_code: "regression_gate",
            ontology_similarity: latestSim,
            generation: currentGen,
            failed_acs: regression.regressed_ac_indices,
          };
        }
      }

      if (latestWonder?.requires_evolution === true) {
        return {
          converged: false,
          reason: "Evolution-required gate: Wonder engine signals further refinement needed",
          reason_code: "evolution_required",
          ontology_similarity: latestSim,
          generation: currentGen,
        };
      }

      if (this.config.validationGateEnabled && validationOutput !== undefined) {
        if (validationOutput.trim().length === 0) {
          return {
            converged: false,
            reason: "Validation gate: empty validation output",
            reason_code: "validation_gate",
            ontology_similarity: latestSim,
            generation: currentGen,
          };
        }
      }

      const driftBlock = this._driftGateFailure(latestDrift);
      if (driftBlock) {
        return {
          converged: false,
          reason: driftBlock.reason,
          reason_code: "drift_exceeded",
          ontology_similarity: latestSim,
          generation: currentGen,
          combined_drift: driftBlock.combined_drift,
          drift_band: driftBlock.drift_band,
        };
      }

      return {
        converged: true,
        reason: `Ontology converged: similarity ${latestSim.toFixed(3)} >= ${this.config.convergenceThreshold}`,
        reason_code: "similarity",
        ontology_similarity: latestSim,
        generation: currentGen,
        combined_drift: latestDrift?.combined_drift,
        drift_band: latestDrift?.band,
      };
    }

    if (numCompleted >= this.config.stagnationWindow && this._checkStagnation(lineage)) {
      if (evalGateFailure) {
        return {
          converged: false,
          reason: `Stagnation blocked by ${evalGateFailure.reason}`,
          reason_code: "no_drift",
          ontology_similarity: latestSim,
          generation: currentGen,
          failed_acs: evalGateFailure.failedAcs,
        };
      }
      const driftBlock = this._driftGateFailure(latestDrift);
      if (driftBlock) {
        return {
          converged: false,
          reason: `Stagnation blocked by ${driftBlock.reason}`,
          reason_code: "no_drift",
          ontology_similarity: latestSim,
          generation: currentGen,
          combined_drift: driftBlock.combined_drift,
          drift_band: driftBlock.drift_band,
        };
      }
      return {
        converged: true,
        reason: `Stagnation: ontology unchanged for ${this.config.stagnationWindow} consecutive generations`,
        reason_code: "no_drift",
        ontology_similarity: latestSim,
        generation: currentGen,
        combined_drift: latestDrift?.combined_drift,
        drift_band: latestDrift?.band,
      };
    }

    if (
      this.config.enableOscillationDetection &&
      numCompleted >= 3 &&
      this._checkOscillation(lineage)
    ) {
      if (evalGateFailure) {
        return {
          converged: false,
          reason: `Oscillation blocked by ${evalGateFailure.reason}`,
          reason_code: "oscillation",
          ontology_similarity: latestSim,
          generation: currentGen,
          failed_acs: evalGateFailure.failedAcs,
        };
      }
      const driftBlock = this._driftGateFailure(latestDrift);
      if (driftBlock) {
        return {
          converged: false,
          reason: `Oscillation blocked by ${driftBlock.reason}`,
          reason_code: "oscillation",
          ontology_similarity: latestSim,
          generation: currentGen,
          combined_drift: driftBlock.combined_drift,
          drift_band: driftBlock.drift_band,
        };
      }
      return {
        converged: true,
        reason: "Oscillation: ontology cycling between two states (A→B→A)",
        reason_code: "oscillation",
        ontology_similarity: latestSim,
        generation: currentGen,
        combined_drift: latestDrift?.combined_drift,
        drift_band: latestDrift?.band,
      };
    }

    if (
      this.config.enableSpinningDetection &&
      numCompleted >= this.config.stagnationWindow &&
      this._checkSpinning(lineage)
    ) {
      if (evalGateFailure) {
        return {
          converged: false,
          reason: `Spinning blocked by ${evalGateFailure.reason}`,
          reason_code: "spinning",
          ontology_similarity: latestSim,
          generation: currentGen,
          failed_acs: evalGateFailure.failedAcs,
        };
      }
      const driftBlock = this._driftGateFailure(latestDrift);
      if (driftBlock) {
        return {
          converged: false,
          reason: `Spinning blocked by ${driftBlock.reason}`,
          reason_code: "spinning",
          ontology_similarity: latestSim,
          generation: currentGen,
          combined_drift: driftBlock.combined_drift,
          drift_band: driftBlock.drift_band,
        };
      }
      return {
        converged: true,
        reason: `Spinning: identical execution output for ${this.config.stagnationWindow} consecutive generations`,
        reason_code: "spinning",
        ontology_similarity: latestSim,
        generation: currentGen,
        combined_drift: latestDrift?.combined_drift,
        drift_band: latestDrift?.band,
      };
    }

    if (
      this.config.enableDiminishingReturnsDetection &&
      numCompleted >= this.config.stagnationWindow &&
      this._checkDiminishingReturns(lineage)
    ) {
      if (evalGateFailure) {
        return {
          converged: false,
          reason: `Diminishing returns blocked by ${evalGateFailure.reason}`,
          reason_code: "diminishing_returns",
          ontology_similarity: latestSim,
          generation: currentGen,
          failed_acs: evalGateFailure.failedAcs,
        };
      }
      const driftBlock = this._driftGateFailure(latestDrift);
      if (driftBlock) {
        return {
          converged: false,
          reason: `Diminishing returns blocked by ${driftBlock.reason}`,
          reason_code: "diminishing_returns",
          ontology_similarity: latestSim,
          generation: currentGen,
          combined_drift: driftBlock.combined_drift,
          drift_band: driftBlock.drift_band,
        };
      }
      return {
        converged: true,
        reason: `Diminishing returns: eval score improvement below ${this.config.diminishingReturnsMinDelta} for ${this.config.stagnationWindow} generations`,
        reason_code: "diminishing_returns",
        ontology_similarity: latestSim,
        generation: currentGen,
        combined_drift: latestDrift?.combined_drift,
        drift_band: latestDrift?.band,
      };
    }

    if (numCompleted >= this.config.maxGenerations) {
      return {
        converged: false,
        reason: `Exhausted at max generations (${this.config.maxGenerations})`,
        reason_code: "max_generations",
        ontology_similarity: latestSim,
        generation: currentGen,
        failed_acs: evalGateFailure?.failedAcs,
      };
    }

    return {
      converged: false,
      reason: `Continuing: similarity ${latestSim.toFixed(3)} < ${this.config.convergenceThreshold}`,
      reason_code: "continuing",
      ontology_similarity: latestSim,
      generation: currentGen,
    };
  }

  private _latestSimilarity(lineage: OntologyLineage): number {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    if (completed.length < 2) return 0;
    const prev = completed[completed.length - 2].ontology_schema.fields;
    const curr = completed[completed.length - 1].ontology_schema.fields;
    return computeOntologySimilarity(prev, curr);
  }

  private _checkStagnation(lineage: OntologyLineage): boolean {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    const window = completed.slice(-this.config.stagnationWindow);
    if (window.length < this.config.stagnationWindow) return false;

    const fingerprints = window.map((g) => ontologyFingerprint(g.ontology_schema.fields));
    return fingerprints.every((fp) => fp === fingerprints[0]);
  }

  private _checkOscillation(lineage: OntologyLineage): boolean {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    if (completed.length < 3) return false;

    const n = completed.length;
    const genA = completed[n - 3].ontology_schema.fields;
    const genB = completed[n - 2].ontology_schema.fields;
    const genC = completed[n - 1].ontology_schema.fields;

    const simAC = computeOntologySimilarity(genA, genC);
    const simBC = computeOntologySimilarity(genB, genC);

    return simAC >= 0.9 && simBC < 0.7;
  }

  /** Same execution output repeated across the stagnation window (upstream SPINNING). */
  private _checkSpinning(lineage: OntologyLineage): boolean {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    const window = completed.slice(-this.config.stagnationWindow);
    if (window.length < this.config.stagnationWindow) return false;

    const outputs = window.map((g) => g.execution_output ?? "");
    const first = outputs[0];
    return first.length > 0 && outputs.every((o) => o === first);
  }

  /** Eval score improvement below threshold for the stagnation window (upstream DIMINISHING_RETURNS). */
  private _checkDiminishingReturns(lineage: OntologyLineage): boolean {
    const completed = lineage.generations.filter((g) => g.phase === "completed");
    const window = completed.slice(-this.config.stagnationWindow);
    if (window.length < this.config.stagnationWindow) return false;

    const scores = window.map((g) => g.evaluation_summary?.score);
    if (scores.some((s) => s === undefined)) return false;

    for (let i = 1; i < scores.length; i++) {
      const delta = scores[i]! - scores[i - 1]!;
      if (delta >= this.config.diminishingReturnsMinDelta) return false;
    }
    return true;
  }

  private _evalGateFailure(latestEvaluation?: {
    final_approved: boolean;
    score?: number;
    ac_results: ACResult[];
  }): { reason: string; reason_code: ConvergenceReasonCode; failedAcs?: number[] } | null {
    if (!this.config.evalGateEnabled || !latestEvaluation) {
      return null;
    }

    if (latestEvaluation.score !== undefined && latestEvaluation.score < this.config.evalMinScore) {
      return {
        reason: `Eval gate: score ${latestEvaluation.score.toFixed(3)} < minimum ${this.config.evalMinScore}`,
        reason_code: "eval_gate",
      };
    }

    const failedAcs = (latestEvaluation.ac_results ?? [])
      .filter((ac) => !ac.passed)
      .map((ac) => ac.ac_index);
    if (failedAcs.length > 0) {
      return {
        reason: `AC gate: ${failedAcs.length} acceptance criteria failing`,
        reason_code: "ac_gate",
        failedAcs,
      };
    }

    if (latestEvaluation.final_approved === false) {
      return {
        reason: "Approval gate: final_approved is false",
        reason_code: "approval_gate",
      };
    }

    return null;
  }

  private _driftGateFailure(
    latestDrift?: Pick<DriftReport, "combined_drift" | "band">
  ): { reason: string; combined_drift: number; drift_band: DriftBand } | null {
    if (!this.config.driftGateEnabled || !latestDrift) {
      return null;
    }
    if (latestDrift.combined_drift > this.config.driftMaxCombined) {
      return {
        reason: `drift_exceeded: combined ${latestDrift.combined_drift.toFixed(3)} > ${this.config.driftMaxCombined}`,
        combined_drift: latestDrift.combined_drift,
        drift_band: latestDrift.band,
      };
    }
    return null;
  }
}
