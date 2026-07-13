import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ConfigError } from "../errors/payment-errors.js";
import { resolvePaymentsConfigPath } from "./paths.js";
import { PaymentsConfigSchema, type PaymentsConfig } from "./schema.js";

export { PaymentsConfigSchema, type PaymentsConfig };

/** Effect service for `payments.json` persistence. */
export class PaymentsConfigService extends Context.Tag("clawql/PaymentsConfigService")<
  PaymentsConfigService,
  {
    readonly load: () => Effect.Effect<PaymentsConfig, ConfigError>;
    readonly save: (config: PaymentsConfig) => Effect.Effect<string, ConfigError>;
    readonly merge: (
      patch: Partial<PaymentsConfig>
    ) => Effect.Effect<{ config: PaymentsConfig; path: string }, ConfigError>;
  }
>() {}

function parsePaymentsConfig(raw: string): PaymentsConfig {
  return PaymentsConfigSchema.parse(JSON.parse(raw));
}

function loadPaymentsConfigEffect(
  env: NodeJS.ProcessEnv
): Effect.Effect<PaymentsConfig, ConfigError> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolvePaymentsConfigPath(env);
      try {
        const raw = await readFile(path, "utf8");
        return parsePaymentsConfig(raw);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return PaymentsConfigSchema.parse({});
        }
        throw err;
      }
    },
    catch: (cause) =>
      new ConfigError({
        reason: "failed to load payments config",
        cause,
      }),
  });
}

function savePaymentsConfigEffect(
  config: PaymentsConfig,
  env: NodeJS.ProcessEnv
): Effect.Effect<string, ConfigError> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolvePaymentsConfigPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
      return path;
    },
    catch: (cause) =>
      new ConfigError({
        reason: "failed to save payments config",
        cause,
      }),
  });
}

export function paymentsConfigLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PaymentsConfigService> {
  return Layer.succeed(
    PaymentsConfigService,
    PaymentsConfigService.of({
      load: () => loadPaymentsConfigEffect(env),
      save: (config) => savePaymentsConfigEffect(config, env),
      merge: (patch) =>
        Effect.gen(function* () {
          const current = yield* loadPaymentsConfigEffect(env);
          const config = PaymentsConfigSchema.parse({
            ...current,
            ...patch,
            stripe: { ...current.stripe, ...patch.stripe },
            x402: { ...current.x402, ...patch.x402 },
          });
          const path = yield* savePaymentsConfigEffect(config, env);
          return { config, path };
        }),
    })
  );
}
