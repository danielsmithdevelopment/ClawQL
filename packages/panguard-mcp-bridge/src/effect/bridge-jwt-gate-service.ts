import { Context, Data, Effect, Layer } from "effect";
import { isBridgeJwtGateEnabled } from "../jwt-gate.js";
import {
  verifyAuthorizationHeaderEffect,
  type BridgeJwtVerifyResult,
} from "./jwt-gate-effect.js";

export class BridgeJwtGateError extends Data.TaggedError("BridgeJwtGateError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class BridgeJwtGateService extends Context.Tag("clawql/BridgeJwtGateService")<
  BridgeJwtGateService,
  {
    readonly isEnabled: () => Effect.Effect<boolean>;
    readonly verifyAuthorizationHeader: (
      authorization: string | undefined
    ) => Effect.Effect<BridgeJwtVerifyResult, BridgeJwtGateError>;
  }
>() {}

export const BridgeJwtGateServiceLive = Layer.succeed(
  BridgeJwtGateService,
  BridgeJwtGateService.of({
    isEnabled: () => Effect.sync(() => isBridgeJwtGateEnabled()),
    verifyAuthorizationHeader: (authorization) =>
      verifyAuthorizationHeaderEffect(authorization).pipe(
        Effect.mapError(
          (cause) =>
            new BridgeJwtGateError({
              reason: cause instanceof Error ? cause.message : String(cause),
              cause,
            })
        )
      ),
  })
);

export function runBridgeJwtGateEffect<A, E>(
  program: Effect.Effect<A, E, BridgeJwtGateService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(BridgeJwtGateServiceLive)));
}
