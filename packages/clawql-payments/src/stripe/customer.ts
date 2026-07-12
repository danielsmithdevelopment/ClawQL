import { mergePaymentsConfig } from "../config/store.js";

export type StripeSetupInput = {
  accountId?: string;
  publishableKey?: string;
  webhookSecret?: string;
};

export type StripeSetupResult = {
  configured: boolean;
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
    configured: Boolean(config.stripe.accountId || config.stripe.publishableKey),
    path,
    accountId: config.stripe.accountId,
  };
}

export type StripeCustomerInput = {
  email: string;
  name?: string;
};

export type StripeCustomerResult = {
  id: string;
  email: string;
  status: "stub";
};

/** Stripe API integration lands in a follow-up; returns a deterministic stub id for CLI wiring. */
export async function createStripeCustomer(
  input: StripeCustomerInput
): Promise<StripeCustomerResult> {
  const slug = input.email.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24);
  return {
    id: `cus_stub_${slug}`,
    email: input.email,
    status: "stub",
  };
}

export type StripeSubscriptionInput = {
  customerId: string;
  plan: "pro" | "team";
};

export type StripeSubscriptionResult = {
  id: string;
  customerId: string;
  plan: string;
  status: "stub";
};

export async function createStripeSubscription(
  input: StripeSubscriptionInput
): Promise<StripeSubscriptionResult> {
  return {
    id: `sub_stub_${input.customerId.replace(/^cus_/, "")}`,
    customerId: input.customerId,
    plan: input.plan,
    status: "stub",
  };
}

export type StripeInvoiceInput = {
  customerId: string;
  amountCents: number;
  description?: string;
};

export type StripeInvoiceResult = {
  id: string;
  customerId: string;
  amountCents: number;
  status: "stub";
};

export async function createStripeInvoice(
  input: StripeInvoiceInput
): Promise<StripeInvoiceResult> {
  return {
    id: `inv_stub_${input.customerId.replace(/^cus_/, "")}_${input.amountCents}`,
    customerId: input.customerId,
    amountCents: input.amountCents,
    status: "stub",
  };
}

export type StripeWebhookEvent = {
  id: string;
  type: string;
  payload: unknown;
};

export function verifyStripeWebhookSignature(
  _payload: string,
  _signature: string,
  _secret: string
): boolean {
  return false;
}

export type MeteredUsageInput = {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
};

export async function reportMeteredUsage(
  input: MeteredUsageInput
): Promise<{ id: string; quantity: number }> {
  return {
    id: `ur_stub_${input.subscriptionItemId}`,
    quantity: input.quantity,
  };
}

export type PortalSessionInput = {
  customerId: string;
  returnUrl: string;
};

export async function createCustomerPortalSession(
  input: PortalSessionInput
): Promise<{ url: string; customerId: string }> {
  return {
    url: `https://billing.stripe.com/session/stub/${input.customerId}`,
    customerId: input.customerId,
  };
}
