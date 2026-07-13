import type { AdaptiveRouter } from "clawql-inference";
import type { Seed } from "./seed.js";
import type {
  EventStore,
  WonderEngine,
  ReflectEngine,
  Executor,
  Evaluator,
  EvaluationSummary,
  WonderOutput,
} from "./interfaces.js";
import { ConvergenceCriteria, type ConvergenceConfig } from "./convergence.js";
import type { OntologyLineage } from "./lineage.js";
import type { ModelEscalationDecision } from "clawql-inference";

export interface LoopResult {
  lineage: OntologyLineage;
  converged: boolean;
  finalSeed: Seed;
  generations: GenerationSnapshot[];
}

export interface GenerationSnapshot {
  generationNumber: number;
  seed: Seed;
  executionOutput: string;
  evaluation: EvaluationSummary;
  wonder?: WonderOutput;
  routing?: ModelEscalationDecision;
}

export interface LoopRoutingOptions {
  router?: AdaptiveRouter;
  /** Decomposed child tasks start at frugal tier when routing is enabled. */
  isDecomposedChild?: boolean;
}

export type EvolutionaryLoopDeps = {
  readonly eventStore: EventStore;
  readonly wonderEngine: WonderEngine;
  readonly reflectEngine: ReflectEngine;
  readonly executor: Executor;
  readonly evaluator: Evaluator;
  readonly convergenceConfig: ConvergenceConfig;
  readonly routingOptions: LoopRoutingOptions;
};

export class EvolutionaryLoop {
  private readonly convergence: ConvergenceCriteria;

  constructor(
    private readonly eventStore: EventStore,
    private readonly wonderEngine: WonderEngine,
    private readonly reflectEngine: ReflectEngine,
    private readonly executor: Executor,
    private readonly evaluator: Evaluator,
    config: Partial<ConvergenceConfig> = {},
    private readonly routingOptions: LoopRoutingOptions = {}
  ) {
    this.convergence = new ConvergenceCriteria(config);
  }

  /** Dependencies for native Effect.gen loop body. */
  loopDeps(): EvolutionaryLoopDeps {
    return {
      eventStore: this.eventStore,
      wonderEngine: this.wonderEngine,
      reflectEngine: this.reflectEngine,
      executor: this.executor,
      evaluator: this.evaluator,
      convergenceConfig: this.convergence.config,
      routingOptions: this.routingOptions,
    };
  }

  /**
   * @param runOverrides Optional per-run limits (e.g. MCP `maxGenerations` / `convergenceThreshold`).
   */
  async run(seed: Seed, runOverrides?: Partial<ConvergenceConfig>): Promise<LoopResult> {
    const { runEvolutionaryLoopBodyEffect } = await import("./effect/evolutionary-loop-effect.js");
    const { Effect } = await import("effect");
    return Effect.runPromise(runEvolutionaryLoopBodyEffect(this.loopDeps(), seed, runOverrides));
  }
}
