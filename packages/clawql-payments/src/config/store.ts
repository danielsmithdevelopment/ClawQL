import { Effect } from "effect";
import { PaymentsConfigService } from "./payments-config-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { PaymentsConfigSchema, type PaymentsConfig } from "./schema.js";

export { PaymentsConfigSchema, type PaymentsConfig };

export async function loadPaymentsConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentsConfig> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const config = yield* PaymentsConfigService;
      return yield* config.load();
    }),
    env
  );
}

export async function savePaymentsConfig(
  config: PaymentsConfig,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const svc = yield* PaymentsConfigService;
      return yield* svc.save(config);
    }),
    env
  );
}

export async function mergePaymentsConfig(
  patch: Partial<PaymentsConfig>,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ config: PaymentsConfig; path: string }> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const svc = yield* PaymentsConfigService;
      return yield* svc.merge(patch);
    }),
    env
  );
}
