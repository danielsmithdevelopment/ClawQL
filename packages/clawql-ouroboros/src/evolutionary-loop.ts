import { v4 as uuidv4 } from "uuid";
import {
  buildModelEscalationAuditEntry,
  evaluateAgentCoordination,
  type AdaptiveRouter,
  type EngineCallContext,
  type ModelEscalationDecision,
} from "clawql-inference";
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
import { driftReportPayload, measureDrift } from "./drift.js";
import type { OntologyLineage } from "./lineage.js";
import { appendInferenceAuditEvent } from "./glue/routing-audit.js";
import { buildRoutingCorrelationId, buildRoutingFailureSignals } from "./glue/routing-failures.js";

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
    let routingDecision: ModelEscalationDecision | undefined;

    while (generationNumber <= maxGenerations) {
      if (this.routingOptions.router && routingDecision === undefined) {
        routingDecision = this.routingOptions.router.initialTier({
          isDecomposedChild: this.routingOptions.isDecomposedChild ?? false,
          seedId: seed.metadata.seed_id,
        });
      }

      const engineCtx: EngineCallContext = {
        seedId: seed.metadata.seed_id,
        generationNumber,
        routing: routingDecision,
      };

      if (generationNumber > 1) {
        const prevGen = generations[generations.length - 1];

        latestWonder = await this.wonderEngine.wonder(currentSeed, prevGen.evaluation, engineCtx);

        const reflect = await this.reflectEngine.reflect(
          currentSeed,
          prevGen.executionOutput,
          prevGen.evaluation,
          latestWonder,
          engineCtx
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

      const executionOutput = await this.executor.execute(currentSeed, engineCtx);
      const evaluation = await this.evaluator.evaluate(executionOutput, currentSeed, engineCtx);

      const snapshot: GenerationSnapshot = {
        generationNumber,
        seed: currentSeed,
        executionOutput,
        evaluation,
        wonder: latestWonder,
        routing: routingDecision,
      };
      generations.push(snapshot);

      const failedConstraints = evaluation.ac_results
        .filter((ac) => !ac.passed)
        .map((ac) => ac.ac_content);
      const driftReport = measureDrift({
        baselineSeed: seed,
        currentOutput: executionOutput,
        constraintViolations: failedConstraints,
        currentConcepts: currentSeed.ontology_schema.fields.map((f) => f.name),
      });

      await this.eventStore.append({
        type: "drift_measured",
        seed_id: seed.metadata.seed_id,
        data: driftReportPayload(driftReport, {
          generation_number: generationNumber,
          constraint_violations: failedConstraints,
          current_concepts: currentSeed.ontology_schema.fields.map((f) => f.name),
        }),
        timestamp: new Date(),
      });

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
          routing_decision: routingDecision,
        },
        timestamp: new Date(),
      });

      const lineage = await this.eventStore.getLineage(seed.metadata.seed_id);

      const signal = convergence.evaluate(
        lineage,
        latestWonder,
        evaluation,
        undefined,
        driftReport
      );

      if (signal.converged) {
        await this.eventStore.append({
          type: "ouroboros_finished",
          seed_id: seed.metadata.seed_id,
          data: {
            converged: true,
            generation_count: generations.length,
            reason_code: signal.reason_code,
            reason: signal.reason,
            ontology_similarity: signal.ontology_similarity,
          },
          timestamp: new Date(),
        });
        const finalLineage = await this.eventStore.getLineage(seed.metadata.seed_id);
        return { lineage: finalLineage, converged: true, finalSeed: currentSeed, generations };
      }

      const router = this.routingOptions.router;
      if (router && routingDecision) {
        const failureSignals = buildRoutingFailureSignals({
          generationNumber,
          evaluation,
          driftReport,
          convergenceConfig: convergence.config,
        });
        if (failureSignals.length) {
          const correlationId = buildRoutingCorrelationId(seed.metadata.seed_id, generationNumber);
          const before = routingDecision;
          const after = router.escalate(before, failureSignals[0]!);
          if (
            after.tier !== before.tier ||
            after.modelId !== before.modelId ||
            after.retryAttempt > before.retryAttempt
          ) {
            await appendInferenceAuditEvent(
              this.eventStore,
              seed.metadata.seed_id,
              buildModelEscalationAuditEntry({
                before,
                after,
                correlationId,
              })
            );
            routingDecision = after;
            snapshot.routing = after;
          }

          const coordination = await evaluateAgentCoordination({
            router,
            decision: routingDecision,
            signals: failureSignals,
            driftCombined: driftReport.combined,
            correlationId,
          });
          if (coordination.triggered && coordination.auditEntry) {
            await appendInferenceAuditEvent(
              this.eventStore,
              seed.metadata.seed_id,
              coordination.auditEntry
            );
          }
        }
      }

      generationNumber++;
    }

    await this.eventStore.append({
      type: "ouroboros_finished",
      seed_id: seed.metadata.seed_id,
      data: {
        converged: false,
        generation_count: generations.length,
        reason_code: "max_generations",
        reason: `Exhausted at max generations (${convergence.config.maxGenerations})`,
      },
      timestamp: new Date(),
    });
    const lineage = await this.eventStore.getLineage(seed.metadata.seed_id);
    return { lineage, converged: false, finalSeed: currentSeed, generations };
  }
}
