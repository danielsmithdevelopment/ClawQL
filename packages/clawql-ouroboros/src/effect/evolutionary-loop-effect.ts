import { v4 as uuidv4 } from "uuid";
import { Effect } from "effect";
import {
  buildModelEscalationAuditEntry,
  evaluateAgentCoordination,
  type EngineCallContext,
  type ModelEscalationDecision,
} from "clawql-inference";
import type { Seed } from "../seed.js";
import type { Evaluator, Executor, ReflectEngine, WonderEngine } from "../interfaces.js";
import { ConvergenceCriteria, type ConvergenceConfig } from "../convergence.js";
import { driftReportPayload, measureDrift } from "../drift.js";
import type { LoopRoutingOptions } from "../evolutionary-loop.js";
import type { GenerationSnapshot, LoopResult, EvolutionaryLoopDeps } from "../evolutionary-loop.js";
import { appendInferenceAuditEvent } from "../glue/routing-audit.js";
import { buildRoutingCorrelationId, buildRoutingFailureSignals } from "../glue/routing-failures.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";
import type { WonderOutput } from "../interfaces.js";

export function runEvolutionaryLoopBodyEffect(
  deps: EvolutionaryLoopDeps,
  seed: Seed,
  runOverrides?: Partial<ConvergenceConfig>
): Effect.Effect<LoopResult, OuroborosError> {
  return Effect.gen(function* () {
    const convergence = new ConvergenceCriteria({
      ...deps.convergenceConfig,
      ...runOverrides,
    });
    const maxGenerations = convergence.config.maxGenerations;

    let currentSeed = seed;
    const generations: GenerationSnapshot[] = [];
    let generationNumber = 1;
    let latestWonder: WonderOutput | undefined;
    let routingDecision: ModelEscalationDecision | undefined;

    while (generationNumber <= maxGenerations) {
      if (deps.routingOptions.router && routingDecision === undefined) {
        routingDecision = deps.routingOptions.router.initialTier({
          isDecomposedChild: deps.routingOptions.isDecomposedChild ?? false,
          seedId: seed.metadata.seed_id,
        });
      }

      const engineCtx: EngineCallContext = {
        seedId: seed.metadata.seed_id,
        generationNumber,
        routing: routingDecision,
      };

      if (generationNumber > 1) {
        const prevGen = generations[generations.length - 1]!;

        latestWonder = yield* ouroborosFromPromise(() =>
          deps.wonderEngine.wonder(currentSeed, prevGen.evaluation, engineCtx)
        );

        const reflect = yield* ouroborosFromPromise(() =>
          deps.reflectEngine.reflect(
            currentSeed,
            prevGen.executionOutput,
            prevGen.evaluation,
            latestWonder!,
            engineCtx
          )
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

      const executionOutput = yield* ouroborosFromPromise(() =>
        deps.executor.execute(currentSeed, engineCtx)
      );
      const evaluation = yield* ouroborosFromPromise(() =>
        deps.evaluator.evaluate(executionOutput, currentSeed, engineCtx)
      );

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

      yield* ouroborosFromPromise(() =>
        deps.eventStore.append({
          type: "drift_measured",
          seed_id: seed.metadata.seed_id,
          data: driftReportPayload(driftReport, {
            generation_number: generationNumber,
            constraint_violations: failedConstraints,
            current_concepts: currentSeed.ontology_schema.fields.map((f) => f.name),
          }),
          timestamp: new Date(),
        })
      );

      yield* ouroborosFromPromise(() =>
        deps.eventStore.append({
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
        })
      );

      const lineage = yield* ouroborosFromPromise(() =>
        deps.eventStore.getLineage(seed.metadata.seed_id)
      );

      const signal = convergence.evaluate(
        lineage,
        latestWonder,
        evaluation,
        undefined,
        driftReport
      );

      if (signal.converged) {
        yield* ouroborosFromPromise(() =>
          deps.eventStore.append({
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
          })
        );
        const finalLineage = yield* ouroborosFromPromise(() =>
          deps.eventStore.getLineage(seed.metadata.seed_id)
        );
        return { lineage: finalLineage, converged: true, finalSeed: currentSeed, generations };
      }

      const router = deps.routingOptions.router;
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
            yield* ouroborosFromPromise(() =>
              appendInferenceAuditEvent(
                deps.eventStore,
                seed.metadata.seed_id,
                buildModelEscalationAuditEntry({
                  before,
                  after,
                  correlationId,
                })
              )
            );
            routingDecision = after;
            snapshot.routing = after;
          }

          const coordination = yield* ouroborosFromPromise(() =>
            evaluateAgentCoordination({
              router,
              decision: routingDecision!,
              signals: failureSignals,
              driftCombined: driftReport.combined_drift,
              correlationId,
            })
          );
          if (coordination.triggered && coordination.auditEntry) {
            yield* ouroborosFromPromise(() =>
              appendInferenceAuditEvent(
                deps.eventStore,
                seed.metadata.seed_id,
                coordination.auditEntry!
              )
            );
          }
        }
      }

      generationNumber++;
    }

    yield* ouroborosFromPromise(() =>
      deps.eventStore.append({
        type: "ouroboros_finished",
        seed_id: seed.metadata.seed_id,
        data: {
          converged: false,
          generation_count: generations.length,
          reason_code: "max_generations",
          reason: `Exhausted at max generations (${convergence.config.maxGenerations})`,
        },
        timestamp: new Date(),
      })
    );
    const lineage = yield* ouroborosFromPromise(() =>
      deps.eventStore.getLineage(seed.metadata.seed_id)
    );
    return { lineage, converged: false, finalSeed: currentSeed, generations };
  });
}
