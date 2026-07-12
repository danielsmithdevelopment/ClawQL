import type { Seed } from "./seed.js";

export type GenerationPhase =
  | "wondering"
  | "reflecting"
  | "seeding"
  | "executing"
  | "evaluating"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ACResult {
  ac_index: number;
  ac_content: string;
  passed: boolean;
  score?: number;
  evidence: string;
}

export interface EvaluationSummary {
  final_approved: boolean;
  score?: number;
  ac_results: ACResult[];
}

export interface GenerationRecord {
  generation_number: number;
  seed: Seed;
  execution_output?: string;
  evaluation_summary?: EvaluationSummary;
  phase: GenerationPhase;
  ontology_schema: Seed["ontology_schema"];
}

export interface DriftSummary {
  combined_drift: number;
  band: string;
  goal_drift: number;
  constraint_drift: number;
  ontology_drift: number;
  generation_number?: number;
}

export interface ConvergenceSummary {
  converged: boolean;
  reason_code?: string;
  reason?: string;
  ontology_similarity?: number;
  generation_count?: number;
}

export interface OntologyLineage {
  seed_id: string;
  current_generation: number;
  generations: GenerationRecord[];
  status: "active" | "converged" | "exhausted" | "aborted";
  /** Latest `drift_measured` event for this lineage root, when present. */
  latest_drift?: DriftSummary;
  /** Latest `ouroboros_finished` convergence outcome, when present. */
  latest_convergence?: ConvergenceSummary;
}
