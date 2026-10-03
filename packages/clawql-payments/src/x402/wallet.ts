import { Context, Data, Effect, Layer } from "effect";
import {
  PaymentsConfigService,
  paymentsConfigLiveLayer,
} from "../config/payments-config-service.js";

export type X402Asset = "USDC";

export type X402WalletSetupInput = {
  address: string;
  facilitatorUrl?: string;
  defaultAsset?: X402Asset;
};

export type X402WalletSetupResult = {
  address: string;
  facilitatorUrl?: string;
  defaultAsset: X402Asset;
  path: string;
};

export class X402WalletError extends Data.TaggedError("X402WalletError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Persist x402 wallet address (+ optional facilitator) into payments config (Effect-primary).
 * Requires {@link PaymentsConfigService} in the environment.
 */
export function setupX402WalletEffect(
  input: X402WalletSetupInput
): Effect.Effect<X402WalletSetupResult, X402WalletError, PaymentsConfigService> {
  return Effect.gen(function* () {
    const configSvc = yield* PaymentsConfigService;
    const { config, path } = yield* configSvc
      .merge({
        x402: {
          walletAddress: input.address,
          facilitatorUrl: input.facilitatorUrl,
          defaultAsset: input.defaultAsset ?? "USDC",
        },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new X402WalletError({
              reason:
                "reason" in cause && typeof cause.reason === "string"
                  ? cause.reason
                  : "Failed to merge payments config",
              cause,
            })
        )
      );

    return {
      address: config.x402.walletAddress ?? input.address,
      facilitatorUrl: config.x402.facilitatorUrl,
      defaultAsset: config.x402.defaultAsset,
      path,
    };
  });
}

/** Promise façade for CLI / hosts that still await wallet setup. */
export async function setupX402Wallet(
  input: X402WalletSetupInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<X402WalletSetupResult> {
  return Effect.runPromise(
    setupX402WalletEffect(input).pipe(Effect.provide(paymentsConfigLiveLayer(env)))
  );
}

/** Effect surface over x402 receiving-wallet persistence. */
export class X402WalletService extends Context.Service<
  X402WalletService,
  {
    readonly setup: (
      input: X402WalletSetupInput
    ) => Effect.Effect<X402WalletSetupResult, X402WalletError>;
  }
>()("clawql/X402WalletService") {}

export function x402WalletLiveLayer(): Layer.Layer<
  X402WalletService,
  never,
  PaymentsConfigService
> {
  return Layer.effect(
    X402WalletService,
    Effect.gen(function* () {
      const configSvc = yield* PaymentsConfigService;
      return X402WalletService.of({
        setup: (input) =>
          Effect.gen(function* () {
            const { config, path } = yield* configSvc
              .merge({
                x402: {
                  walletAddress: input.address,
                  facilitatorUrl: input.facilitatorUrl,
                  defaultAsset: input.defaultAsset ?? "USDC",
                },
              })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new X402WalletError({
                      reason:
                        "reason" in cause && typeof cause.reason === "string"
                          ? cause.reason
                          : "Failed to merge payments config",
                      cause,
                    })
                )
              );
            return {
              address: config.x402.walletAddress ?? input.address,
              facilitatorUrl: config.x402.facilitatorUrl,
              defaultAsset: config.x402.defaultAsset,
              path,
            };
          }),
      });
    })
  );
}
