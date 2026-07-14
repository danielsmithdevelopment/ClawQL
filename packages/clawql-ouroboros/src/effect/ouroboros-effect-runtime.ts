import { Cause, Effect, Exit, Layer } from "effect";
import type { z } from "zod";
import type {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
} from "../mcp-hooks.js";
import { OuroborosContextService, ouroborosContextLiveLayer } from "./ouroboros-context-service.js";
import {
  OuroborosEventStoreService,
  ouroborosEventStoreLiveLayer,
} from "./ouroboros-event-store-service.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { OuroborosEnginesService, ouroborosEnginesLiveLayer } from "./ouroboros-engines-service.js";
import { OuroborosLoopService, ouroborosLoopLiveLayer } from "./ouroboros-loop-service.js";
import { OuroborosPollerService, ouroborosPollerLiveLayer } from "./ouroboros-poller-service.js";
import { OuroborosToolsService, ouroborosToolsLiveLayer } from "./ouroboros-tools-service.js";

export type OuroborosServices =
  | OuroborosContextService
  | OuroborosToolsService
  | OuroborosEventStoreService
  | OuroborosEnginesService
  | OuroborosLoopService
  | OuroborosPollerService;

/** Merged Effect Layer for Ouroboros domain services. */
export function ouroborosServicesLiveLayer(): Layer.Layer<OuroborosServices> {
  return Layer.mergeAll(
    ouroborosEventStoreLiveLayer(),
    ouroborosEnginesLiveLayer(),
    ouroborosLoopLiveLayer(),
    ouroborosPollerLiveLayer(),
    ouroborosContextLiveLayer(),
    ouroborosToolsLiveLayer()
  );
}

function throwOuroborosFailure(cause: Cause.Cause<unknown>): never {
  const squashed = Cause.squash(cause);
  if (squashed instanceof OuroborosError && squashed.cause != null) {
    if (squashed.cause instanceof Error) throw squashed.cause;
    throw new Error(String(squashed.cause));
  }
  throw squashed;
}

/** Run an Ouroboros Effect program with default services Layer. */
export async function runOuroborosEffect<A, E>(
  program: Effect.Effect<A, E, OuroborosServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(ouroborosServicesLiveLayer()))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throwOuroborosFailure(exit.cause);
}

export function ouroborosCreateSeedProgram(
  input: z.infer<typeof CreateSeedFromDocumentSchema>
): Effect.Effect<unknown, unknown, OuroborosServices> {
  return Effect.gen(function* () {
    const tools = yield* OuroborosToolsService;
    return yield* tools.createSeedFromDocument(input);
  });
}

export function ouroborosRunLoopProgram(
  input: z.infer<typeof RunOuroborosSchema>
): Effect.Effect<unknown, unknown, OuroborosServices> {
  return Effect.gen(function* () {
    const tools = yield* OuroborosToolsService;
    return yield* tools.runEvolutionaryLoop(input);
  });
}

export function ouroborosLineageProgram(
  input: z.infer<typeof GetLineageStatusSchema>
): Effect.Effect<unknown, unknown, OuroborosServices> {
  return Effect.gen(function* () {
    const tools = yield* OuroborosToolsService;
    return yield* tools.getLineageStatus(input);
  });
}

export function ouroborosMeasureDriftProgram(
  input: z.infer<typeof MeasureDriftSchema>
): Effect.Effect<unknown, unknown, OuroborosServices> {
  return Effect.gen(function* () {
    const tools = yield* OuroborosToolsService;
    return yield* tools.measureDrift(input);
  });
}

export function ouroborosProposeRevisionProgram(
  input: z.infer<typeof ProposeSeedRevisionFromEvalSchema>
): Effect.Effect<unknown, unknown, OuroborosServices> {
  return Effect.gen(function* () {
    const tools = yield* OuroborosToolsService;
    return yield* tools.proposeSeedRevisionFromEval(input);
  });
}
