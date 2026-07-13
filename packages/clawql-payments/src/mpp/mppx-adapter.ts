import { Context, Effect, Layer } from "effect";
import { ConfigError } from "../errors/payment-errors.js";
import { MppVerificationError } from "./verification-errors.js";

export type MppxAdapterConfig = {
  secretKey: string;
  stripeProfileId?: string;
  tempoCurrency?: string;
  tempoRecipient?: string;
  testnet?: boolean;
};

export type MppxModule = {
  Mppx?: {
    create: (input: Record<string, unknown>) => unknown;
  };
  evm?: {
    charge: (input: Record<string, unknown>) => unknown;
  };
  stripe?: (input: Record<string, unknown>) => unknown;
  tempo?: {
    charge: (input: Record<string, unknown>) => unknown;
  };
};

/** Optional Effect wrapper around the `mppx` SDK (dynamic import). */
export class MppxAdapterService extends Context.Tag("clawql/MppxAdapterService")<
  MppxAdapterService,
  {
    readonly isAvailable: () => boolean;
    readonly loadModule: () => Effect.Effect<MppxModule, ConfigError>;
    readonly createRuntime: (
      config: MppxAdapterConfig
    ) => Effect.Effect<unknown, ConfigError | MppVerificationError>;
  }
>() {}

export function isMppxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_MPPX_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function mppxAdapterLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<MppxAdapterService> {
  let cached: MppxModule | null | undefined;

  const loadModuleEffect = Effect.gen(function* () {
    if (!isMppxEnabled(env)) {
      return yield* Effect.fail(new ConfigError({ reason: "CLAWQL_MPPX_ENABLED is not set" }));
    }
    if (cached !== undefined) {
      if (!cached) {
        return yield* Effect.fail(new ConfigError({ reason: "mppx module is not installed" }));
      }
      return cached;
    }

    const mod = yield* Effect.tryPromise({
      try: () => import("mppx/server") as Promise<unknown>,
      catch: (cause) => {
        cached = null;
        return new ConfigError({
          reason:
            "mppx is not installed — add optional dependency `mppx` and set CLAWQL_MPPX_ENABLED=1",
          cause,
        });
      },
    });
    cached = mod as MppxModule;
    return cached;
  });

  return Layer.succeed(
    MppxAdapterService,
    MppxAdapterService.of({
      isAvailable: () => isMppxEnabled(env),
      loadModule: () => loadModuleEffect,
      createRuntime: (config) =>
        Effect.gen(function* () {
          const mod = yield* loadModuleEffect;
          if (!mod.Mppx?.create) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "mppx/server export Mppx.create is unavailable",
              })
            );
          }

          const methods: unknown[] = [];
          if (config.tempoCurrency && config.tempoRecipient && mod.tempo?.charge) {
            methods.push(
              mod.tempo.charge({
                currency: config.tempoCurrency,
                recipient: config.tempoRecipient,
                ...(config.testnet ? { testnet: true } : {}),
              })
            );
          }
          if (config.stripeProfileId && mod.stripe) {
            methods.push(
              mod.stripe({
                networkId: config.stripeProfileId,
                paymentMethodTypes: ["card", "link"],
              })
            );
          }
          if (config.tempoCurrency && config.tempoRecipient && mod.evm?.charge) {
            methods.push(
              mod.evm.charge({
                currency: config.tempoCurrency,
                recipient: config.tempoRecipient,
                x402: env.CLAWQL_X402_FACILITATOR_URL?.trim()
                  ? { facilitator: env.CLAWQL_X402_FACILITATOR_URL.trim() }
                  : undefined,
              })
            );
          }

          if (methods.length === 0) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason:
                  "mppx runtime requires STRIPE_PROFILE_ID and/or CLAWQL_MPPX_TEMPO_* configuration",
              })
            );
          }

          return mod.Mppx.create({
            methods,
            secretKey: config.secretKey,
          });
        }),
    })
  );
}
