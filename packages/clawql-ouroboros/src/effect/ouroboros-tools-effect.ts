import { Effect } from "effect";
import type { z } from "zod";
import { driftReportPayload, measureDrift } from "../drift.js";
import { resolveBaselineSeed } from "../glue/resolve-baseline-seed.js";
import { createSeedFromDocumentCore } from "../glue/seed-from-document.js";
import {
  langfuseEvalAutoApplyEnabled,
  loadLatestSeedFromLineage,
  normalizeLangfuseEvalPayload,
  parseLangfuseMinScore,
  processLangfuseEval,
} from "../eval/index.js";
import type {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
} from "../mcp-hooks.js";
import { SeedSchema } from "../seed.js";
import { OuroborosEventStoreService } from "./ouroboros-event-store-service.js";
import { OuroborosLoopService } from "./ouroboros-loop-service.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";
import { executeRunEvolutionaryLoopFromInputEffect } from "./ouroboros-loop-service.js";

export type CreateSeedFromDocumentResult = ReturnType<typeof createSeedFromDocumentCore>;

export function executeCreateSeedFromDocumentEffect(
  input: z.infer<typeof CreateSeedFromDocumentSchema>
): Effect.Effect<CreateSeedFromDocumentResult> {
  return Effect.sync(() => createSeedFromDocumentCore(input));
}

export function executeRunEvolutionaryLoopEffect(
  input: z.infer<typeof RunOuroborosSchema>
): Effect.Effect<
  Awaited<
    ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.runEvolutionaryLoop.handler>
  >,
  OuroborosError,
  OuroborosLoopService
> {
  return executeRunEvolutionaryLoopFromInputEffect(input);
}

export function executeGetLineageStatusEffect(
  input: z.infer<typeof GetLineageStatusSchema>
): Effect.Effect<
  Awaited<ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.getLineageStatus.handler>>,
  OuroborosError,
  OuroborosEventStoreService
> {
  return Effect.gen(function* () {
    const es = yield* OuroborosEventStoreService;
    return yield* es.getLineage(input.seedId);
  });
}

export type MeasureDriftResult = Awaited<
  ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.measureDrift.handler>
>;

function taggedFailureMessage(err: unknown): string {
  if (err instanceof OuroborosError) {
    const cause = err.cause;
    return cause instanceof Error ? cause.message : cause != null ? String(cause) : err.reason;
  }
  return err instanceof Error ? err.message : String(err);
}

function measureDriftFailure(err: unknown): MeasureDriftResult {
  return { ok: false, error: taggedFailureMessage(err) };
}

export function executeMeasureDriftEffect(
  input: z.infer<typeof MeasureDriftSchema>
): Effect.Effect<MeasureDriftResult, never, OuroborosEventStoreService> {
  return Effect.gen(function* () {
    const es = yield* OuroborosEventStoreService;
    const baselineSeed = yield* ouroborosFromPromise(() =>
      resolveBaselineSeed(input, es.getStore())
    );
    if (!baselineSeed) {
      return {
        ok: false as const,
        error: "Provide `seed`, `seedId` with lineage events, or `seedContent`",
      };
    }

    const report = measureDrift({
      baselineSeed,
      currentOutput: input.currentOutput,
      constraintViolations: input.constraintViolations,
      currentConcepts: input.currentConcepts,
    });

    const rootSeedId = input.seedId ?? baselineSeed.metadata.seed_id;
    const payload = driftReportPayload(report, {
      generation_number: input.generationNumber ?? null,
      constraint_violations: input.constraintViolations ?? [],
      current_concepts: input.currentConcepts ?? [],
    });

    if (input.persistEvent !== false && input.seedId) {
      yield* es.append({
        type: "drift_measured",
        seed_id: input.seedId,
        data: payload,
        timestamp: new Date(),
      });
    }

    return { ok: true as const, report: payload, seedId: rootSeedId };
  }).pipe(Effect.catchAll((err) => Effect.succeed(measureDriftFailure(err))));
}

export type ProposeSeedRevisionResult = Awaited<
  ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.proposeSeedRevisionFromEval.handler>
>;

export function executeProposeSeedRevisionFromEvalEffect(
  input: z.infer<typeof ProposeSeedRevisionFromEvalSchema>
): Effect.Effect<ProposeSeedRevisionResult, never, OuroborosEventStoreService> {
  return Effect.gen(function* () {
    const es = yield* OuroborosEventStoreService;

    let evalEvent =
      input.payload !== undefined ? normalizeLangfuseEvalPayload(input.payload) : null;
    if (!evalEvent && input.scoreValue !== undefined) {
      evalEvent = {
        scoreName: input.scoreName?.trim() || "langfuse_score",
        scoreValue: input.scoreValue,
        traceId: input.traceId,
        seedId: input.seedId,
        correlationId: input.correlationId,
        comment: input.comment,
        metadata: {},
      };
    }
    if (!evalEvent) {
      return {
        ok: false as const,
        error: "Missing eval: provide `payload` or `scoreValue` (+ optional scoreName/seedId)",
      };
    }

    const minScore = input.minScore ?? parseLangfuseMinScore(process.env);
    const autoApply = input.autoApply ?? langfuseEvalAutoApplyEnabled(process.env);
    const baseSeed = input.baseSeed !== undefined ? SeedSchema.parse(input.baseSeed) : undefined;
    const store = es.getStore();

    return yield* ouroborosFromPromise(() =>
      processLangfuseEval(evalEvent!, {
        minScore,
        autoApply,
        eventStore: store,
        baseSeed,
        loadSeedByLineageId: async (seedId) => loadLatestSeedFromLineage(store, seedId),
      })
    );
  }).pipe(
    Effect.catchAll((err) =>
      Effect.succeed({
        ok: false as const,
        error: taggedFailureMessage(err),
      })
    )
  );
}
