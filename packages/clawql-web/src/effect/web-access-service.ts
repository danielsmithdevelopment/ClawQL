import { Context, Data, Effect, Layer } from "effect";
import { loadWebConfig, type WebConfig } from "../config.js";
import { createWebService } from "../service.js";
import type { SearchOptions, SearchResponse } from "../interfaces.js";

export class WebAccessError extends Data.TaggedError("WebAccessError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class WebAccessService extends Context.Tag("clawql/WebAccessService")<
  WebAccessService,
  {
    readonly loadConfig: (env?: NodeJS.ProcessEnv) => Effect.Effect<WebConfig>;
    readonly search: (
      query: string,
      options?: SearchOptions,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SearchResponse, WebAccessError>;
  }
>() {}

export const WebAccessServiceLive = Layer.succeed(
  WebAccessService,
  WebAccessService.of({
    loadConfig: (env) => Effect.sync(() => loadWebConfig(env)),
    search: (query, options, env) =>
      Effect.tryPromise({
        try: () => createWebService(env).search(query, options),
        catch: (cause) =>
          new WebAccessError({
            reason: cause instanceof Error ? cause.message : "web search failed",
            cause,
          }),
      }),
  })
);

export function runWebAccessEffect<A, E>(
  program: Effect.Effect<A, E, WebAccessService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(WebAccessServiceLive)));
}
