import type { Seed } from "./seed.js";
import type { OntologyLineage, EvaluationSummary, ACResult } from "./lineage.js";

export type { EvaluationSummary, ACResult };

export interface StoredEvent {
  type: string;
  seed_id: string;
  data: unknown;
  timestamp?: Date;
}

export interface EventStore {
  append(event: StoredEvent): Promise<void>;
  /** Must return a fully populated OntologyLineage — no `any` escape hatch. */
  getLineage(seedId: string): Promise<OntologyLineage>;
}

export interface WonderOutput {
  insights: string[];
  suggested_refinements: string[];
  requires_evolution?: boolean;
}

export interface ReflectOutput {
  newSeedData: Partial<Omit<Seed, "metadata">>;
  rationale: string;
}

export interface WonderEngine {
  wonder(seed: Seed, previousEvaluation?: EvaluationSummary): Promise<WonderOutput>;
}

export interface ReflectEngine {
  reflect(
    seed: Seed,
    executionOutput: string,
    evaluation: EvaluationSummary | undefined,
    wonder: WonderOutput,
  ): Promise<ReflectOutput>;
}

export interface Executor {
  execute(seed: Seed): Promise<string>;
}

export interface Evaluator {
  evaluate(executionOutput: string, seed: Seed): Promise<EvaluationSummary>;
}
