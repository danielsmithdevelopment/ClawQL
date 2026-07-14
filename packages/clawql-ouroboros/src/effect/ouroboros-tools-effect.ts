import { Effect } from "effect";
import type { z } from "zod";
import { driftReportPayload, measureDrift } from "../drift.js";
import { resolveBaselineSeed } from "../glue/resolve-baseline-seed.js";
import type {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
} from "../mcp-hooks.js";
import { OuroborosContextService } from "./ouroboros-context-service.js";
import { OuroborosEventStoreService } from "./ouroboros-event-store-service.js";
import { OuroborosLoopService } from "./ouroboros-loop-service.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";
import { executeRunEvolutionaryLoopFromInputEffect } from "./ouroboros-loop-service.js";

export function executeCreateSeedFromDocumentEffect(
  input: z.infer<typeof CreateSeedFromDocumentSchema>
): Effect.Effect<
  Awaited<
    ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.createSeedFromDocument.handler>
  >,
  OuroborosError,
  OuroborosContextService
> {
  return Effect.gen(function* () {
    const ctxSvc = yield* OuroborosContextService;
    const ctx = ctxSvc.getContext();
    return yield* ouroborosFromPromise(async () => {
      const { ouroborosMcpTools } = await import("../mcp-hooks.js");
      return ouroborosMcpTools.createSeedFromDocument.handler(input, ctx);
    });
  });
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

function measureDriftFailure(err: unknown): MeasureDriftResult {
  if (err instanceof OuroborosError) {
    const cause = err.cause;
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : cause != null ? String(cause) : err.reason,
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  };
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

export function executeProposeSeedRevisionFromEvalEffect(
  input: z.infer<typeof ProposeSeedRevisionFromEvalSchema>
): Effect.Effect<
  Awaited<
    ReturnType<
      typeof import("../mcp-hooks.js").ouroborosMcpTools.proposeSeedRevisionFromEval.handler
    >
  >,
  OuroborosError,
  OuroborosContextService
> {
  return Effect.gen(function* () {
    const ctxSvc = yield* OuroborosContextService;
    const ctx = ctxSvc.getContext();
    return yield* ouroborosFromPromise(async () => {
      const { ouroborosMcpTools } = await import("../mcp-hooks.js");
      return ouroborosMcpTools.proposeSeedRevisionFromEval.handler(input, ctx);
    });
  });
}
