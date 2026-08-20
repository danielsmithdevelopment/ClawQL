import { Cause, Effect, Exit, Layer } from "effect";
import { DataEngineService, dataEngineLiveLayer } from "./data-engine-service.js";
import type { DataQueryResult, DataStatus, IngestPayload, IngestResult } from "../engines/types.js";

export type DataServices = DataEngineService;

export function dataServicesLiveLayer(env: NodeJS.ProcessEnv = process.env): Layer.Layer<DataServices> {
  return dataEngineLiveLayer(env);
}

function throwDataFailure(cause: Cause.Cause<unknown>): never {
  throw Cause.squash(cause);
}

export async function runDataEffect<A>(program: Effect.Effect<A, unknown, DataServices>, env?: NodeJS.ProcessEnv): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(dataServicesLiveLayer(env))));
  if (Exit.isSuccess(exit)) return exit.value;
  throwDataFailure(exit.cause);
}

export function dataQueryProgram(sql: string): Effect.Effect<DataQueryResult, unknown, DataServices> {
  return Effect.gen(function* () {
    const svc = yield* DataEngineService;
    return yield* svc.query(sql);
  });
}

export function dataIngestProgram(payload: IngestPayload): Effect.Effect<IngestResult, unknown, DataServices> {
  return Effect.gen(function* () {
    const svc = yield* DataEngineService;
    return yield* svc.ingest(payload);
  });
}

export function dataStatusProgram(): Effect.Effect<DataStatus, unknown, DataServices> {
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
