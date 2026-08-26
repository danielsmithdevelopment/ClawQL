/**
 * ID-JAG Layer C helpers built on {@link TeePlatformAdapter}.
 */

import {
  createLocalIdJagAssertionSigner,
  type IdJagAssertionSigner,
  type IdJagSignRequest,
  type McpOAuthSigningMaterial,
} from "clawql-auth";
import { Effect } from "effect";

import { createTeeIdJagSignerBridge, type TeeSignFn } from "./bridge.js";
import {
  resolveTeePlatformFromEnv,
  teeStrictFromEnv,
  TeePlatformError,
  type ResolveTeePlatformFromEnvOptions,
  type TeePlatformAdapter,
} from "./platform.js";

export type CreateIdJagSignerFromPlatformOptions = {
  readonly adapter: TeePlatformAdapter;
  readonly sign: TeeSignFn;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Wrap a host sign function with platform attestation metadata.
 * When `CLAWQL_TEE_STRICT=1`, rejects simulated platforms.
 */
export const createIdJagSignerFromPlatform = (
  options: CreateIdJagSignerFromPlatformOptions
): IdJagAssertionSigner => {
  const env = options.env ?? process.env;
  return createTeeIdJagSignerBridge({
    attestationId: options.adapter.platform,
    sign: (request: IdJagSignRequest) =>
      Effect.gen(function* () {
        const attestation = yield* options.adapter.getAttestation().pipe(
          Effect.mapError(
            (err: TeePlatformError) =>
              new Error(err.message, err.cause ? { cause: err.cause } : undefined)
          )
        );
        if (teeStrictFromEnv(env) && attestation.platform === "simulated") {
          return yield* Effect.fail(
            new Error("CLAWQL_TEE_STRICT=1 rejects simulated attestation")
          );
        }
        if (process.env.CLAWQL_TEE_DEBUG?.trim() === "1") {
          process.stderr.write(
            `[clawql-tee] id-jag sign platform=${attestation.platform} measurement=${attestation.measurementId ?? "n/a"}\n`
          );
        }
        return yield* options.sign(request);
      }),
  });
};

/** Simulated platform + local jose sign (dev / homelab). */
export const createSimulatedIdJagSigner = (
  signing: McpOAuthSigningMaterial,
  env?: NodeJS.ProcessEnv
): Effect.Effect<IdJagAssertionSigner, TeePlatformError> =>
  Effect.gen(function* () {
    const adapter = yield* resolveTeePlatformFromEnv({ env });
    const local = createLocalIdJagAssertionSigner(signing);
    return createIdJagSignerFromPlatform({
      adapter,
      sign: (req) => local.sign(req),
      env,
    });
  });

/** Env-resolved platform adapter + local jose sign. Hardware platforms fail on attestation until wired. */
export const createIdJagSignerFromEnvEffect = (
  signing: McpOAuthSigningMaterial,
  options: ResolveTeePlatformFromEnvOptions = {}
): Effect.Effect<IdJagAssertionSigner, TeePlatformError> =>
  Effect.gen(function* () {
    const adapter = yield* resolveTeePlatformFromEnv(options);
    const local = createLocalIdJagAssertionSigner(signing);
    return createIdJagSignerFromPlatform({
      adapter,
      sign: (req) => local.sign(req),
      env: options.env,
    });
  });
