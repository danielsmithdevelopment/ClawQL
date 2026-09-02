import { Context, Data, Effect, Layer } from "effect";
import { assertOpenBenchTraceShape, sha256Json } from "../schema/validate.js";
import { scrubJsonValue, scrubTextLocal } from "../scrub/local.js";
import type { OpenBenchTraceV1 } from "../schema/types.js";

export class OpenBenchDatasetError extends Data.TaggedError("OpenBenchDatasetError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class OpenBenchDatasetService extends Context.Tag("clawql/OpenBenchDatasetService")<
  OpenBenchDatasetService,
  {
    readonly assertTraceShape: (trace: OpenBenchTraceV1) => Effect.Effect<void, OpenBenchDatasetError>;
    readonly sha256Json: (value: unknown) => Effect.Effect<string, OpenBenchDatasetError>;
    readonly scrubText: (text: string, fields: Set<string>) => Effect.Effect<string, OpenBenchDatasetError>;
    readonly scrubJson: (
      value: unknown,
      fields?: Set<string>
    ) => Effect.Effect<unknown, OpenBenchDatasetError>;
  }
>() {}

export const OpenBenchDatasetServiceLive = Layer.succeed(
  OpenBenchDatasetService,
  OpenBenchDatasetService.of({
    assertTraceShape: (trace) =>
      Effect.try({
        try: () => {
          assertOpenBenchTraceShape(trace);
        },
        catch: (cause) =>
          new OpenBenchDatasetError({
            reason: cause instanceof Error ? cause.message : "invalid trace shape",
            cause,
          }),
      }),
    sha256Json: (value) => Effect.sync(() => sha256Json(value)),
    scrubText: (text, fields) => Effect.sync(() => scrubTextLocal(text, fields)),
    scrubJson: (value, fields) => Effect.sync(() => scrubJsonValue(value, fields)),
  })
);

export function runOpenBenchDatasetEffect<A, E>(
  program: Effect.Effect<A, E, OpenBenchDatasetService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(OpenBenchDatasetServiceLive)));
}
