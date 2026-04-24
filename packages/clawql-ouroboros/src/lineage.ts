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

export interface OntologyLineage {
  seed_id: string;
  current_generation: number;
  generations: GenerationRecord[];
  status: "active" | "converged" | "exhausted" | "aborted";
}
