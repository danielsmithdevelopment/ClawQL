import { Effect } from "effect";
import type { z } from "zod";
import type {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
} from "../mcp-hooks.js";
import { OuroborosContextService } from "./ouroboros-context-service.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";

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
  OuroborosContextService
> {
  return Effect.gen(function* () {
    const ctxSvc = yield* OuroborosContextService;
    const ctx = ctxSvc.getContext();
    return yield* ouroborosFromPromise(async () => {
      const { ouroborosMcpTools } = await import("../mcp-hooks.js");
      return ouroborosMcpTools.runEvolutionaryLoop.handler(input, ctx);
    });
  });
}

export function executeGetLineageStatusEffect(
  input: z.infer<typeof GetLineageStatusSchema>
): Effect.Effect<
  Awaited<ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.getLineageStatus.handler>>,
  OuroborosError,
  OuroborosContextService
> {
  return Effect.gen(function* () {
    const ctxSvc = yield* OuroborosContextService;
    const ctx = ctxSvc.getContext();
    return yield* ouroborosFromPromise(async () => {
      const { ouroborosMcpTools } = await import("../mcp-hooks.js");
      return ouroborosMcpTools.getLineageStatus.handler(input, ctx);
    });
  });
}

export function executeMeasureDriftEffect(
  input: z.infer<typeof MeasureDriftSchema>
): Effect.Effect<
  Awaited<ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.measureDrift.handler>>,
  OuroborosError,
  OuroborosContextService
> {
  return Effect.gen(function* () {
    const ctxSvc = yield* OuroborosContextService;
    const ctx = ctxSvc.getContext();
    return yield* ouroborosFromPromise(async () => {
      const { ouroborosMcpTools } = await import("../mcp-hooks.js");
      return ouroborosMcpTools.measureDrift.handler(input, ctx);
    });
  });
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
