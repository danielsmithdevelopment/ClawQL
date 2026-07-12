import { readFile } from "node:fs/promises";
import {
  setupStripe,
  createStripeCustomer,
  createStripeSubscription,
  createStripeInvoice,
  verifyAndProcessStripeWebhook,
  verifyStripeWebhookSignature,
  isStripeConfigured,
  reportMeteredUsage,
} from "../stripe/index.js";
import { appendPaymentWormEntry, buildStripeMeterReportedEntry } from "../audit/index.js";
import { loadPaymentsConfig, mergePaymentsConfig } from "../config/store.js";
import { StripeNotConfiguredError, StripeWebhookVerificationError } from "../stripe/errors.js";

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
  const env = options.env ?? process.env;
  const result = await setupStripe(
    {
      accountId: options.accountId,
      publishableKey: options.publishableKey,
      webhookSecret: options.webhookSecret,
    },
    env
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `Stripe ${result.configured ? "configured" : "partially configured"} → ${result.path}`
  );
  if (result.accountId) console.log(`Account: ${result.accountId}`);
  console.log(
    `API key: ${result.apiKeyConfigured ? "STRIPE_SECRET_KEY set" : "set STRIPE_SECRET_KEY for live API calls"}`
  );
  return 0;
}

export type PaymentsStripeCustomerCreateOptions = {
  email?: string;
  name?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
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

  const env = options.env ?? process.env;
  if (!isStripeConfigured(env)) {
    console.error("STRIPE_SECRET_KEY is required for live Stripe API calls");
    return 1;
  }

  try {
    const customer = await createStripeCustomer({
      email: options.email,
      name: options.name,
      env,
    });

    await mergePaymentsConfig({ stripe: { customerId: customer.id } }, env);

    if (options.json) {
      console.log(JSON.stringify(customer, null, 2));
      return 0;
    }

    console.log(
      `Created Stripe customer ${customer.id} (${customer.email}) → saved to payments.json`
    );
    return 0;
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

export type PaymentsStripeSubscriptionCreateOptions = {
  customer?: string;
  plan?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
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

  const env = options.env ?? process.env;
  if (!isStripeConfigured(env)) {
    console.error("STRIPE_SECRET_KEY is required for live Stripe API calls");
    return 1;
  }

  try {
    const sub = await createStripeSubscription({
      customerId: options.customer,
      plan: options.plan,
      env,
    });

    if (options.json) {
      console.log(JSON.stringify(sub, null, 2));
      return 0;
    }

    console.log(
      `Created subscription ${sub.id} for ${sub.customerId} on ${sub.plan} (${sub.status})`
    );
    return 0;
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

export type PaymentsStripeInvoiceCreateOptions = {
  customer?: string;
  amount?: number;
  description?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsStripeInvoiceCreate(
  options: PaymentsStripeInvoiceCreateOptions = {}
): Promise<number> {
  if (!options.customer?.trim() || options.amount === undefined) {
    console.error("Usage: clawql payments stripe invoice create --customer cus_xxx --amount 500");
    return 1;
  }

  const env = options.env ?? process.env;
  if (!isStripeConfigured(env)) {
    console.error("STRIPE_SECRET_KEY is required for live Stripe API calls");
    return 1;
  }

  try {
    const invoice = await createStripeInvoice({
      customerId: options.customer,
      amountCents: Math.round(options.amount * 100),
      description: options.description,
      env,
    });

    if (options.json) {
      console.log(JSON.stringify(invoice, null, 2));
      return 0;
    }

    console.log(
      `Created invoice ${invoice.id} for ${invoice.customerId}: $${options.amount.toFixed(2)} (${invoice.status})`
    );
    if (invoice.hostedInvoiceUrl) {
      console.log(`Hosted invoice: ${invoice.hostedInvoiceUrl}`);
    }
    console.log("Payment audit events are recorded when invoice.paid webhooks arrive.");
    return 0;
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

export type PaymentsStripeWebhookVerifyOptions = {
  payloadPath?: string;
  signature?: string;
  webhookSecret?: string;
  process?: boolean;
  tenantId?: string;
  correlationId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsStripeWebhookVerify(
  options: PaymentsStripeWebhookVerifyOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const secret = options.webhookSecret ?? config.stripe.webhookSecret;
  if (!secret?.trim()) {
    console.error(
      "Webhook secret required — run clawql payments stripe setup --webhook-secret whsec_... or pass --webhook-secret"
    );
    return 1;
  }
  if (!options.payloadPath?.trim()) {
    console.error(
      "Usage: clawql payments stripe webhook verify --payload /path/to/body.json --signature t=...,v1=..."
    );
    return 1;
  }
  if (!options.signature?.trim()) {
    console.error("Stripe-Signature header value is required (--signature)");
    return 1;
  }

  const payload = await readFile(options.payloadPath, "utf8");

  try {
    if (options.process) {
      const result = await verifyAndProcessStripeWebhook({
        payload,
        signature: options.signature,
        secret,
        tenantId: options.tenantId,
        correlationId: options.correlationId,
        env,
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
      }
      console.log(
        `Verified and processed ${result.eventType} (${result.eventId}) handled=${result.handled}`
      );
      return 0;
    }

    const verified = verifyStripeWebhookSignature(payload, options.signature, secret);
    if (!verified.ok) {
      console.error(`Webhook verification failed: ${verified.reason}`);
      return 1;
    }

    if (options.json) {
      console.log(
        JSON.stringify({ ok: true, type: verified.event.type, id: verified.event.id }, null, 2)
      );
      return 0;
    }

    console.log(`Verified webhook ${verified.event.type} (${verified.event.id})`);
    return 0;
  } catch (error) {
    if (error instanceof StripeWebhookVerificationError) {
      console.error(`Webhook verification failed: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

export async function runPaymentsStripeWebhookListen(): Promise<number> {
  console.log(`Forward Stripe webhooks with the Stripe CLI, then verify/process locally:

  stripe listen --forward-to http://127.0.0.1:8080/webhooks/stripe
  clawql payments stripe webhook verify --payload ./event.json --signature "$STRIPE_SIGNATURE" --process

Store the webhook signing secret via:
  clawql payments stripe setup --webhook-secret whsec_...`);
  return 0;
}

export type PaymentsStripeMeterReportOptions = {
  value?: number;
  customer?: string;
  eventName?: string;
  identifier?: string;
  tenantId?: string;
  correlationId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsStripeMeterReport(
  options: PaymentsStripeMeterReportOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  if (!isStripeConfigured(env)) {
    console.error("STRIPE_SECRET_KEY is required for live Stripe API calls");
    return 1;
  }

  const config = await loadPaymentsConfig(env);
  const customerId =
    options.customer?.trim() || config.stripe.customerId?.trim() || env.STRIPE_CUSTOMER_ID?.trim();
  const eventName =
    options.eventName?.trim() ||
    config.stripe.meterEventName?.trim() ||
    env.STRIPE_METER_EVENT_NAME?.trim();

  if (!customerId || !eventName) {
    console.error(
      "Usage: clawql payments stripe meter report --value 1 --customer cus_xxx --event-name clawql_inference_calls"
    );
    return 1;
  }

  const value = options.value ?? 1;
  const tenantId = options.tenantId?.trim() || config.tenantId?.trim() || "default";

  const result = await reportMeteredUsage({
    eventName,
    stripeCustomerId: customerId,
    value,
    identifier: options.identifier,
    env,
  });

  appendPaymentWormEntry(
    buildStripeMeterReportedEntry({
      tenantId,
      value,
      eventName,
      stripeCustomerId: customerId,
      correlationId: options.correlationId,
    })
  );

  if (options.json) {
    console.log(JSON.stringify({ tenantId, ...result, eventName, customerId }, null, 2));
    return 0;
  }

  console.log(
    `Reported Stripe meter ${eventName} +${value} for ${customerId} (id=${result.id}, tenant=${tenantId})`
  );
  return 0;
}
