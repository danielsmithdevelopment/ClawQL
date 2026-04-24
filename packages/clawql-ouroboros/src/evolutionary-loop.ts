import { v4 as uuidv4 } from "uuid";
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
}

export class EvolutionaryLoop {
  private readonly convergence: ConvergenceCriteria;

  constructor(
    private readonly eventStore: EventStore,
    private readonly wonderEngine: WonderEngine,
    private readonly reflectEngine: ReflectEngine,
    private readonly executor: Executor,
    private readonly evaluator: Evaluator,
    config: Partial<ConvergenceConfig> = {},
  ) {
    this.convergence = new ConvergenceCriteria(config);
  }

  /**
   * @param runOverrides Optional per-run limits (e.g. MCP `maxGenerations` / `convergenceThreshold`).
   */
  async run(seed: Seed, runOverrides?: Partial<ConvergenceConfig>): Promise<LoopResult> {
    const convergence = new ConvergenceCriteria({
      ...this.convergence.config,
      ...runOverrides,
    });
    const maxGenerations = convergence.config.maxGenerations;

    let currentSeed = seed;
    const generations: GenerationSnapshot[] = [];
    let generationNumber = 1;
    let latestWonder: WonderOutput | undefined;

    while (generationNumber <= maxGenerations) {
      if (generationNumber > 1) {
        const prevGen = generations[generations.length - 1];

        latestWonder = await this.wonderEngine.wonder(currentSeed, prevGen.evaluation);

        const reflect = await this.reflectEngine.reflect(
          currentSeed,
          prevGen.executionOutput,
          prevGen.evaluation,
          latestWonder,
        );

        currentSeed = {
          ...currentSeed,
          ...reflect.newSeedData,
          metadata: {
            ...currentSeed.metadata,
            parent_seed_id: currentSeed.metadata.seed_id,
            seed_id: `seed_${uuidv4().slice(0, 12)}`,
          },
        } as Seed;
      }

      const executionOutput = await this.executor.execute(currentSeed);
      const evaluation = await this.evaluator.evaluate(executionOutput, currentSeed);

      const snapshot: GenerationSnapshot = {
        generationNumber,
        seed: currentSeed,
        executionOutput,
        evaluation,
        wonder: latestWonder,
      };
      generations.push(snapshot);

      await this.eventStore.append({
        type: "generation_completed",
        seed_id: seed.metadata.seed_id,
        data: {
          generation_number: generationNumber,
          seed: currentSeed,
          execution_output: executionOutput,
          evaluation_summary: evaluation,
          phase: "completed" as const,
          ontology_schema: currentSeed.ontology_schema,
        },
        timestamp: new Date(),
      });

      const lineage = await this.eventStore.getLineage(seed.metadata.seed_id);

      const signal = convergence.evaluate(lineage, latestWonder, evaluation);

      if (signal.converged) {
        await this.eventStore.append({
          type: "ouroboros_finished",
          seed_id: seed.metadata.seed_id,
          data: { converged: true, generation_count: generations.length },
          timestamp: new Date(),
        });
        const finalLineage = await this.eventStore.getLineage(seed.metadata.seed_id);
        return { lineage: finalLineage, converged: true, finalSeed: currentSeed, generations };
      }

      generationNumber++;
    }

    await this.eventStore.append({
      type: "ouroboros_finished",
      seed_id: seed.metadata.seed_id,
      data: { converged: false, generation_count: generations.length },
      timestamp: new Date(),
    });
    const lineage = await this.eventStore.getLineage(seed.metadata.seed_id);
    return { lineage, converged: false, finalSeed: currentSeed, generations };
  }
}
