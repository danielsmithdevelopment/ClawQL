import type { Seed } from "./seed.js";

/** Upstream Q00 weights (skills/status/SKILL.md). */
export const DRIFT_WEIGHTS = {
  goal: 0.5,
  constraint: 0.3,
  ontology: 0.2,
} as const;

export const DRIFT_THRESHOLD_ACCEPTABLE = 0.3;
export const DRIFT_THRESHOLD_EXCELLENT = 0.15;

export type DriftBand = "excellent" | "acceptable" | "exceeded";

export interface DriftComponents {
  goal_drift: number;
  constraint_drift: number;
  ontology_drift: number;
}

export interface DriftReport extends DriftComponents {
  combined_drift: number;
  band: DriftBand;
  weights: typeof DRIFT_WEIGHTS;
  threshold_acceptable: number;
  threshold_excellent: number;
}

export interface MeasureDriftInput {
  /** Root / baseline seed (original goal, constraints, ontology). */
  baselineSeed: Seed;
  currentOutput: string;
  /** Explicit constraint violation messages (upstream `constraint_violations`). */
  constraintViolations?: string[];
  /** Concepts present in current output (upstream `current_concepts`). */
  currentConcepts?: string[];
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length >= 3)
  );
}

function tokenCoverage(reference: string, text: string): number {
  const refTokens = tokenize(reference);
  if (refTokens.size === 0) return 1;
  const textTokens = tokenize(text);
  let hit = 0;
  for (const t of refTokens) {
    if (textTokens.has(t)) hit++;
  }
  return hit / refTokens.size;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function classifyDriftBand(combinedDrift: number): DriftBand {
  if (combinedDrift <= DRIFT_THRESHOLD_EXCELLENT) return "excellent";
  if (combinedDrift <= DRIFT_THRESHOLD_ACCEPTABLE) return "acceptable";
  return "exceeded";
}

function measureGoalDrift(goal: string, currentOutput: string): number {
  return clamp01(1 - tokenCoverage(goal, currentOutput));
}

function measureConstraintDrift(
  constraints: string[],
  currentOutput: string,
  explicitViolations: string[]
): number {
  const violationPenalty = clamp01(Math.min(1, explicitViolations.length * 0.2));

  if (constraints.length === 0) {
    return violationPenalty;
  }

  const unsatisfied = constraints.map((c) => clamp01(1 - tokenCoverage(c, currentOutput)));
  const avgUnsatisfied = unsatisfied.reduce((sum, v) => sum + v, 0) / constraints.length;

  return clamp01(Math.max(violationPenalty, avgUnsatisfied));
}

function conceptPresent(
  concept: string,
  currentOutput: string,
  currentConcepts: string[]
): boolean {
  const needle = concept.toLowerCase();
  if (
    currentConcepts.some(
      (c) => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase())
    )
  ) {
    return true;
  }
  return currentOutput.toLowerCase().includes(needle);
}

function measureOntologyDrift(
  baselineSeed: Seed,
  currentOutput: string,
  currentConcepts: string[]
): number {
  const fieldNames = baselineSeed.ontology_schema.fields.map((f) => f.name);
  const expected =
    currentConcepts.length > 0 ? [...new Set([...fieldNames, ...currentConcepts])] : fieldNames;

  if (expected.length === 0) {
    return 0;
  }

  const matched = expected.filter((name) =>
    conceptPresent(name, currentOutput, currentConcepts)
  ).length;
  const coverage = matched / expected.length;
  return clamp01(1 - coverage);
}

export function measureDrift(input: MeasureDriftInput): DriftReport {
  const constraintViolations = input.constraintViolations ?? [];
  const currentConcepts = input.currentConcepts ?? [];

  const goal_drift = measureGoalDrift(input.baselineSeed.goal, input.currentOutput);
  const constraint_drift = measureConstraintDrift(
    input.baselineSeed.constraints,
    input.currentOutput,
    constraintViolations
  );
  const ontology_drift = measureOntologyDrift(
    input.baselineSeed,
    input.currentOutput,
    currentConcepts
  );

  const combined_drift = clamp01(
    DRIFT_WEIGHTS.goal * goal_drift +
      DRIFT_WEIGHTS.constraint * constraint_drift +
      DRIFT_WEIGHTS.ontology * ontology_drift
  );

  return {
    goal_drift,
    constraint_drift,
    ontology_drift,
    combined_drift,
    band: classifyDriftBand(combined_drift),
    weights: DRIFT_WEIGHTS,
    threshold_acceptable: DRIFT_THRESHOLD_ACCEPTABLE,
    threshold_excellent: DRIFT_THRESHOLD_EXCELLENT,
  };
}

/** Serialize a drift report for event store / MCP responses. */
export function driftReportPayload(
  report: DriftReport,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    goal_drift: round3(report.goal_drift),
    constraint_drift: round3(report.constraint_drift),
    ontology_drift: round3(report.ontology_drift),
    combined_drift: round3(report.combined_drift),
    band: report.band,
    weights: report.weights,
    threshold_acceptable: report.threshold_acceptable,
    threshold_excellent: report.threshold_excellent,
    ...extras,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
