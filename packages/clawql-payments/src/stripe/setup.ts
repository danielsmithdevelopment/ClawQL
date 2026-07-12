import { mergePaymentsConfig } from "../config/store.js";
import { isStripeConfigured } from "./client.js";

export type StripeSetupInput = {
  accountId?: string;
  publishableKey?: string;
  webhookSecret?: string;
};

export type StripeSetupResult = {
  configured: boolean;
  apiKeyConfigured: boolean;
  path: string;
  accountId?: string;
};

export async function setupStripe(
  input: StripeSetupInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeSetupResult> {
  const { config, path } = await mergePaymentsConfig(
    {
      stripe: {
        accountId: input.accountId,
        publishableKey: input.publishableKey,
        webhookSecret: input.webhookSecret,
      },
    },
    env
  );

  return {
    configured: Boolean(
      isStripeConfigured(env) ||
        config.stripe.accountId ||
        config.stripe.publishableKey ||
        config.stripe.webhookSecret
    ),
    apiKeyConfigured: isStripeConfigured(env),
    path,
    accountId: config.stripe.accountId,
  };
}
