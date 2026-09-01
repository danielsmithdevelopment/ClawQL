/**
 * Phase 5 — resolve Faro / telemetry JWT signing keys from Vault KV or env.
 * Secrets are never stored in ProviderConfig; callers receive key material
 * only inside an Effect scope for `signTelemetryJwtEffect`.
 */

import { Context, Effect, Layer } from "effect";

import { ObservabilityError } from "../errors.js";

export type TelemetrySigningKeySource = "env" | "vault" | "memory";

export type TelemetrySigningKeyMaterial = {
  readonly key: string;
  readonly source: TelemetrySigningKeySource;
  /** Vault KV path or env var name used for resolution (never the secret). */
  readonly locator: string;
};

export class TelemetrySigningKeyService extends Context.Tag(
  "clawql/TelemetrySigningKeyService"
)<
  TelemetrySigningKeyService,
  {
    readonly resolve: () => Effect.Effect<TelemetrySigningKeyMaterial, ObservabilityError>;
  }
>() {}

export type VaultKvSigningKeyConfig = {
  readonly endpoint: string;
  readonly token: string;
  /** KV v2 mount (default `secret`). */
  readonly mountPath?: string;
  /** Logical path under mount, e.g. `clawql/observability/worker`. */
  readonly secretPath: string;
  /** Field name inside the KV data object (default `jwt_signing_key`). */
  readonly field?: string;
  readonly fetchImpl?: typeof fetch;
};

const readVaultKvFieldEffect = (
  config: VaultKvSigningKeyConfig
): Effect.Effect<string, ObservabilityError> =>
  Effect.tryPromise({
    try: async () => {
      const mount = (config.mountPath ?? "secret").replace(/^\/+|\/+$/g, "");
      const secretPath = config.secretPath.replace(/^\/+|\/+$/g, "");
      const field = config.field ?? "jwt_signing_key";
      const url = `${config.endpoint.replace(/\/$/, "")}/v1/${mount}/data/${secretPath}`;
      const fetchFn = config.fetchImpl ?? fetch;
      const res = await fetchFn(url, {
        method: "GET",
        headers: {
          "X-Vault-Token": config.token,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(`Vault HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        data?: { data?: Record<string, unknown> };
      };
      const value = json.data?.data?.[field];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Vault secret missing field ${field}`);
      }
      return value;
    },
    catch: (cause) =>
      new ObservabilityError({
        reason: "failed to read telemetry signing key from Vault",
        cause,
      }),
  });

/** Env-only signing key (`TELEMETRY_JWT_SIGNING_KEY` or `JWT_SIGNING_KEY`). */
export const TelemetrySigningKeyFromEnvLive = Layer.succeed(TelemetrySigningKeyService, {
  resolve: () =>
    Effect.gen(function* () {
      const key =
        process.env.TELEMETRY_JWT_SIGNING_KEY?.trim() || process.env.JWT_SIGNING_KEY?.trim();
      if (!key) {
        return yield* Effect.fail(
          new ObservabilityError({
            reason:
              "TELEMETRY_JWT_SIGNING_KEY (or JWT_SIGNING_KEY) is required when Vault is not configured",
          })
        );
      }
      return {
        key,
        source: "env" as const,
        locator: process.env.TELEMETRY_JWT_SIGNING_KEY?.trim()
          ? "TELEMETRY_JWT_SIGNING_KEY"
          : "JWT_SIGNING_KEY",
      };
    }),
});

export const makeTelemetrySigningKeyFromVaultLayer = (
  config: VaultKvSigningKeyConfig
): Layer.Layer<TelemetrySigningKeyService> =>
  Layer.succeed(TelemetrySigningKeyService, {
    resolve: () =>
      Effect.gen(function* () {
        const key = yield* readVaultKvFieldEffect(config);
        return {
          key,
          source: "vault" as const,
          locator: `${config.mountPath ?? "secret"}/data/${config.secretPath}`,
        };
      }),
  });

export const makeTelemetrySigningKeyFromMemoryLayer = (
  key: string
): Layer.Layer<TelemetrySigningKeyService> =>
  Layer.succeed(TelemetrySigningKeyService, {
    resolve: () =>
      Effect.succeed({
        key,
        source: "memory" as const,
        locator: "memory",
      }),
  });

/**
 * Prefer Vault when Vault addr+token env is set; otherwise fall back to env signing key.
 */
export const resolveTelemetrySigningKeyLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TelemetrySigningKeyService> => {
  const endpoint = env.CLAWQL_TELEMETRY_JWT_VAULT_ADDR?.trim() || env.VAULT_ADDR?.trim();
  const token = env.CLAWQL_TELEMETRY_JWT_VAULT_TOKEN?.trim() || env.VAULT_TOKEN?.trim();
  const secretPath =
    env.CLAWQL_TELEMETRY_JWT_VAULT_PATH?.trim() || "clawql/observability/worker";
  const useVault = envTruthy(env.CLAWQL_TELEMETRY_JWT_VAULT) || Boolean(endpoint && token);

  if (useVault && endpoint && token) {
    return makeTelemetrySigningKeyFromVaultLayer({
      endpoint,
      token,
      mountPath: env.CLAWQL_TELEMETRY_JWT_VAULT_MOUNT?.trim() || "secret",
      secretPath,
      field: env.CLAWQL_TELEMETRY_JWT_VAULT_FIELD?.trim() || "jwt_signing_key",
    });
  }

  return TelemetrySigningKeyFromEnvLive;
};

const envTruthy = (value: string | undefined): boolean => {
  const t = value?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
};

/** Resolve key via TelemetrySigningKeyService. */
export const resolveTelemetrySigningKeyEffect = (): Effect.Effect<
  TelemetrySigningKeyMaterial,
  ObservabilityError,
  TelemetrySigningKeyService
> =>
  Effect.gen(function* () {
    const svc = yield* TelemetrySigningKeyService;
    return yield* svc.resolve();
  });
