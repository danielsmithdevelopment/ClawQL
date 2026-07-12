import {
  setupStripe,
  createStripeCustomer,
  createStripeSubscription,
  createStripeInvoice,
} from "../stripe/index.js";
import { appendPaymentWormEntry, buildStripeInvoicePaidEntry } from "../audit/index.js";

export type PaymentsStripeSetupOptions = {
  accountId?: string;
  publishableKey?: string;
  webhookSecret?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsStripeSetup(
  options: PaymentsStripeSetupOptions = {}
): Promise<number> {
  const result = await setupStripe(
    {
      accountId: options.accountId,
      publishableKey: options.publishableKey,
      webhookSecret: options.webhookSecret,
    },
    options.env
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `Stripe ${result.configured ? "configured" : "partially configured"} → ${result.path}`
  );
  if (result.accountId) console.log(`Account: ${result.accountId}`);
  return 0;
}

export type PaymentsStripeCustomerCreateOptions = {
  email?: string;
  name?: string;
  json?: boolean;
};

export async function runPaymentsStripeCustomerCreate(
  options: PaymentsStripeCustomerCreateOptions = {}
): Promise<number> {
  if (!options.email?.trim()) {
    console.error(
      "Usage: clawql payments stripe customer create --email user@acme.com [--name NAME]"
    );
    return 1;
  }

  const customer = await createStripeCustomer({
    email: options.email,
    name: options.name,
  });

  if (options.json) {
    console.log(JSON.stringify(customer, null, 2));
    return 0;
  }

  console.log(`Created Stripe customer ${customer.id} (${customer.email}) [${customer.status}]`);
  return 0;
}

export type PaymentsStripeSubscriptionCreateOptions = {
  customer?: string;
  plan?: string;
  json?: boolean;
};

export async function runPaymentsStripeSubscriptionCreate(
  options: PaymentsStripeSubscriptionCreateOptions = {}
): Promise<number> {
  if (!options.customer?.trim()) {
    console.error(
      "Usage: clawql payments stripe subscription create --customer cus_xxx --plan pro|team"
    );
    return 1;
  }
  if (options.plan !== "pro" && options.plan !== "team") {
    console.error("Plan must be pro or team");
    return 1;
  }

  const sub = await createStripeSubscription({
    customerId: options.customer,
    plan: options.plan,
  });

  if (options.json) {
    console.log(JSON.stringify(sub, null, 2));
    return 0;
  }

  console.log(
    `Created subscription ${sub.id} for ${sub.customerId} on ${sub.plan} [${sub.status}]`
  );
  return 0;
}

export type PaymentsStripeInvoiceCreateOptions = {
  customer?: string;
  amount?: number;
  description?: string;
  tenantId?: string;
  correlationId?: string;
  json?: boolean;
};

export async function runPaymentsStripeInvoiceCreate(
  options: PaymentsStripeInvoiceCreateOptions = {}
): Promise<number> {
  if (!options.customer?.trim() || options.amount === undefined) {
    console.error("Usage: clawql payments stripe invoice create --customer cus_xxx --amount 500");
    return 1;
  }

  const invoice = await createStripeInvoice({
    customerId: options.customer,
    amountCents: Math.round(options.amount * 100),
    description: options.description,
  });

  appendPaymentWormEntry(
    buildStripeInvoicePaidEntry({
      tenantId: options.tenantId ?? "default",
      amountUsd: options.amount,
      correlationId: options.correlationId,
    })
  );

  if (options.json) {
    console.log(JSON.stringify(invoice, null, 2));
    return 0;
  }

  console.log(
    `Created invoice ${invoice.id} for ${invoice.customerId}: $${options.amount.toFixed(2)} [${invoice.status}]`
  );
  return 0;
}

export async function runPaymentsStripeWebhookListen(): Promise<number> {
  console.log(
    "Stripe webhook listener not yet implemented — use stripe listen + clawql payments stripe webhook verify"
  );
  return 0;
}
