import { Context, Effect, Layer } from "effect";
import type { z } from "zod";
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
import {
  executeCreateSeedFromDocumentEffect,
  executeGetLineageStatusEffect,
  executeMeasureDriftEffect,
  executeProposeSeedRevisionFromEvalEffect,
  executeRunEvolutionaryLoopEffect,
} from "./ouroboros-tools-effect.js";

/** Effect service for Ouroboros MCP tool bodies. */
export class OuroborosToolsService extends Context.Tag("clawql/OuroborosToolsService")<
  OuroborosToolsService,
  {
    readonly createSeedFromDocument: (
      input: z.infer<typeof CreateSeedFromDocumentSchema>
    ) => Effect.Effect<
      Awaited<
        ReturnType<
          typeof import("../mcp-hooks.js").ouroborosMcpTools.createSeedFromDocument.handler
        >
      >,
      OuroborosError,
      OuroborosContextService
    >;
    readonly runEvolutionaryLoop: (
      input: z.infer<typeof RunOuroborosSchema>
    ) => Effect.Effect<
      Awaited<
        ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.runEvolutionaryLoop.handler>
      >,
      OuroborosError,
      OuroborosLoopService
    >;
    readonly getLineageStatus: (
      input: z.infer<typeof GetLineageStatusSchema>
    ) => Effect.Effect<
      Awaited<
        ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.getLineageStatus.handler>
      >,
      OuroborosError,
      OuroborosEventStoreService
    >;
    readonly measureDrift: (
      input: z.infer<typeof MeasureDriftSchema>
    ) => Effect.Effect<
      Awaited<ReturnType<typeof import("../mcp-hooks.js").ouroborosMcpTools.measureDrift.handler>>,
      OuroborosError,
      OuroborosContextService
    >;
    readonly proposeSeedRevisionFromEval: (
      input: z.infer<typeof ProposeSeedRevisionFromEvalSchema>
    ) => Effect.Effect<
      Awaited<
        ReturnType<
          typeof import("../mcp-hooks.js").ouroborosMcpTools.proposeSeedRevisionFromEval.handler
        >
      >,
      OuroborosError,
      OuroborosContextService
    >;
  }
>() {}

export function ouroborosToolsLiveLayer(): Layer.Layer<OuroborosToolsService> {
  return Layer.succeed(
    OuroborosToolsService,
    OuroborosToolsService.of({
      createSeedFromDocument: executeCreateSeedFromDocumentEffect,
      runEvolutionaryLoop: executeRunEvolutionaryLoopEffect,
      getLineageStatus: executeGetLineageStatusEffect,
      measureDrift: executeMeasureDriftEffect,
      proposeSeedRevisionFromEval: executeProposeSeedRevisionFromEvalEffect,
    })
  );
}
