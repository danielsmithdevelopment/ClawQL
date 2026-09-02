import { Context, Data, Effect, Layer } from "effect";
import { wireDelegationHandlers } from "../delegate-handlers.js";

export class PanguardBridgeError extends Data.TaggedError("PanguardBridgeError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Registers MCP delegation handlers — Effect surface for bridge wiring. */
export class PanguardBridgeService extends Context.Tag("clawql/PanguardBridgeService")<
  PanguardBridgeService,
  {
    readonly wireDelegation: (input: {
      server: Parameters<typeof wireDelegationHandlers>[0];
      client: Parameters<typeof wireDelegationHandlers>[1];
    }) => Effect.Effect<void, PanguardBridgeError>;
  }
>() {}

export const PanguardBridgeServiceLive = Layer.succeed(
  PanguardBridgeService,
  PanguardBridgeService.of({
    wireDelegation: ({ server, client }) =>
      Effect.sync(() => {
        wireDelegationHandlers(server, client);
      }),
  })
);

export function runPanguardBridgeEffect<A, E>(
  program: Effect.Effect<A, E, PanguardBridgeService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(PanguardBridgeServiceLive)));
}
