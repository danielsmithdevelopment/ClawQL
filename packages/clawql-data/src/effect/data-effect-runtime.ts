import { Cause, Effect, Exit, Layer } from "effect";
import { DataEngineService, dataEngineLiveLayer } from "./data-engine-service.js";
import type { DataError } from "./data-errors.js";
import type { DataQueryResult, DataStatus, IngestPayload, IngestResult } from "../engines/types.js";

export type DataServices = DataEngineService;

export function dataServicesLiveLayer(env: NodeJS.ProcessEnv = process.env): Layer.Layer<DataServices> {
  return dataEngineLiveLayer(env);
}

function throwDataFailure(cause: Cause.Cause<unknown>): never {
  const squashed = Cause.squash(cause);
  if (squashed instanceof Error) throw squashed;
  throw new Error(typeof squashed === "string" ? squashed : Cause.pretty(cause));
}

/** Promise edge for MCP handlers / CLIs — runs Effect programs against the live data layer. */
export async function runDataEffect<A>(
  program: Effect.Effect<A, DataError | unknown, DataServices>,
  env?: NodeJS.ProcessEnv
): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(dataServicesLiveLayer(env))));
  if (Exit.isSuccess(exit)) return exit.value;
  throwDataFailure(exit.cause);
}

export function dataQueryProgram(sql: string): Effect.Effect<DataQueryResult, DataError, DataServices> {
  return Effect.gen(function* () {
    const svc = yield* DataEngineService;
    return yield* svc.query(sql);
  });
}

export function dataIngestProgram(payload: IngestPayload): Effect.Effect<IngestResult, DataError, DataServices> {
  return Effect.gen(function* () {
    const svc = yield* DataEngineService;
    return yield* svc.ingest(payload);
  });
}

export function dataStatusProgram(): Effect.Effect<DataStatus, never, DataServices> {
  return Effect.gen(function* () {
    const svc = yield* DataEngineService;
    return svc.status();
  });
}

export async function resetDataEngineForTests(env?: NodeJS.ProcessEnv): Promise<void> {
  await runDataEffect(
    Effect.gen(function* () {
      const svc = yield* DataEngineService;
      yield* svc.close();
    }),
    env
  );
}
