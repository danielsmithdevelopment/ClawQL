import type { EvaluationSummary } from "../interfaces.js";
import type { ConvergenceConfig } from "../convergence.js";
import type { DriftReport } from "../drift.js";
import type { RoutingFailureSignal } from "clawql-inference";

export function buildRoutingFailureSignals(input: {
  generationNumber: number;
  evaluation: EvaluationSummary;
  driftReport: DriftReport;
  convergenceConfig: ConvergenceConfig;
}): RoutingFailureSignal[] {
  const signals: RoutingFailureSignal[] = [];
  for (const ac of input.evaluation.ac_results.filter((row) => !row.passed)) {
    signals.push({
      kind: "ac_failed",
      detail: { ac_content: ac.ac_content, evidence: ac.evidence },
      acIndex: ac.ac_index,
      generation: input.generationNumber,
    });
  }
  if (input.evaluation.score < input.convergenceConfig.evalMinScore) {
    signals.push({
      kind: "eval_below_min",
      detail: {
        score: input.evaluation.score,
        min: input.convergenceConfig.evalMinScore,
      },
      generation: input.generationNumber,
    });
  }
  if (input.driftReport.combined_drift > input.convergenceConfig.driftMaxCombined) {
    signals.push({
      kind: "drift_exceeded",
      detail: {
        combined: input.driftReport.combined_drift,
        max: input.convergenceConfig.driftMaxCombined,
      },
      generation: input.generationNumber,
    });
  }
  return signals;
}

export function buildRoutingCorrelationId(seedId: string, generationNumber: number): string {
  return `${seedId}_gen_${generationNumber}`;
}
