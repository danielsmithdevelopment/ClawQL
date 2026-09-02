import { Context, Effect, Layer } from "effect";
import {
  resolveTeePlatformFromEnv,
  teeStrictFromEnv,
  type ResolveTeePlatformFromEnvOptions,
  type TeePlatformAdapter,
  TeePlatformError,
} from "../platform.js";

export class TeePlatformService extends Context.Tag("clawql/TeePlatformService")<
  TeePlatformService,
  {
    readonly resolvePlatform: (
      options?: ResolveTeePlatformFromEnvOptions
    ) => Effect.Effect<TeePlatformAdapter, TeePlatformError>;
    readonly isStrict: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  }
>() {}

export const TeePlatformServiceLive = Layer.succeed(
  TeePlatformService,
  TeePlatformService.of({
    resolvePlatform: (options) => resolveTeePlatformFromEnv(options),
    isStrict: (env) => Effect.sync(() => teeStrictFromEnv(env)),
  })
);

export function runTeePlatformEffect<A, E>(
  program: Effect.Effect<A, E, TeePlatformService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(TeePlatformServiceLive)));
}
