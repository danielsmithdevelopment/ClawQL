import { Context, Effect, Layer } from "effect";
import { getPlanDefinition, type ClawqlPlanId } from "../plans/tiers.js";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import type { ConfigError } from "../errors/payment-errors.js";
import { isStripeConfigured } from "./stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "./stripe-errors.js";
import { StripeClientService, stripeTryPromise } from "./stripe-client-service.js";

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

export type StripeCustomerInput = {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
};

export type StripeCustomerResult = {
  id: string;
  email: string;
  name?: string | null;
  status: "live";
};

export type StripeSubscriptionInput = {
  customerId: string;
  plan: "pro" | "team";
  env?: NodeJS.ProcessEnv;
};

export type StripeSubscriptionResult = {
  id: string;
  customerId: string;
  plan: string;
  priceId: string;
  status: string;
};

export type StripeInvoiceInput = {
  customerId: string;
  amountCents: number;
  description?: string;
  currency?: string;
  env?: NodeJS.ProcessEnv;
};

export type StripeInvoiceResult = {
  id: string;
  customerId: string;
  amountCents: number;
  status: string;
  hostedInvoiceUrl?: string | null;
};

export type PortalSessionInput = {
  customerId: string;
  returnUrl: string;
  env?: NodeJS.ProcessEnv;
};

function resolvePriceId(plan: ClawqlPlanId): Effect.Effect<string, StripeNotConfigured> {
  const priceId = getPlanDefinition(plan).stripe_price_id;
  if (!priceId) {
    return Effect.fail(
      new StripeNotConfigured({
        reason: `Stripe price id not configured for plan "${plan}" — set STRIPE_${plan.toUpperCase()}_PRICE_ID`,
      })
    );
  }
  return Effect.succeed(priceId);
}

/** Effect service for Stripe billing setup and CRUD helpers. */
export class StripeBillingService extends Context.Tag("clawql/StripeBillingService")<
  StripeBillingService,
  {
    readonly setup: (
      input: StripeSetupInput,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<StripeSetupResult, ConfigError>;
    readonly createCustomer: (
      input: StripeCustomerInput
    ) => Effect.Effect<StripeCustomerResult, StripeApiError | StripeNotConfigured>;
    readonly createSubscription: (
      input: StripeSubscriptionInput
    ) => Effect.Effect<StripeSubscriptionResult, StripeApiError | StripeNotConfigured>;
    readonly createInvoice: (
      input: StripeInvoiceInput
    ) => Effect.Effect<StripeInvoiceResult, StripeApiError | StripeNotConfigured>;
    readonly createPortalSession: (
      input: PortalSessionInput
    ) => Effect.Effect<{ url: string; customerId: string }, StripeApiError | StripeNotConfigured>;
  }
>() {}

export function stripeBillingLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<StripeBillingService, never, StripeClientService | PaymentsConfigService> {
  return Layer.effect(
    StripeBillingService,
    Effect.gen(function* () {
      const stripeClient = yield* StripeClientService;
      const configService = yield* PaymentsConfigService;

      const setup = (input: StripeSetupInput, runEnv: NodeJS.ProcessEnv = env) =>
        Effect.gen(function* () {
          const { config, path } = yield* configService.merge({
            stripe: {
              accountId: input.accountId,
              publishableKey: input.publishableKey,
              webhookSecret: input.webhookSecret,
            },
          });
          return {
            configured: Boolean(
              isStripeConfigured(runEnv) ||
              config.stripe.accountId ||
              config.stripe.publishableKey ||
              config.stripe.webhookSecret
            ),
            apiKeyConfigured: isStripeConfigured(runEnv),
            path,
            accountId: config.stripe.accountId,
          };
        });

      const createCustomer = (input: StripeCustomerInput) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const customer = yield* stripeTryPromise("stripe customer create failed", () =>
            client.customers.create({
              email: input.email,
              name: input.name,
              metadata: input.metadata,
            })
          );
          return {
            id: customer.id,
            email: customer.email ?? input.email,
            name: customer.name,
            status: "live" as const,
          };
        });

      const createSubscription = (input: StripeSubscriptionInput) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const priceId = yield* resolvePriceId(input.plan);
          const subscription = yield* stripeTryPromise("stripe subscription create failed", () =>
            client.subscriptions.create({
              customer: input.customerId,
              items: [{ price: priceId }],
              payment_behavior: "default_incomplete",
              expand: ["latest_invoice.payment_intent"],
            })
          );
          return {
            id: subscription.id,
            customerId:
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer.id,
            plan: input.plan,
            priceId,
            status: subscription.status,
          };
        });

      const createInvoice = (input: StripeInvoiceInput) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const currency = input.currency ?? "usd";
          yield* stripeTryPromise("stripe invoice item create failed", () =>
            client.invoiceItems.create({
              customer: input.customerId,
              amount: input.amountCents,
              currency,
              description: input.description,
            })
          );
          const invoice = yield* stripeTryPromise("stripe invoice create failed", () =>
            client.invoices.create({
              customer: input.customerId,
              auto_advance: true,
              collection_method: "send_invoice",
              days_until_due: 30,
            })
          );
          if (!invoice.id) {
            return yield* Effect.fail(
              new StripeApiError({ reason: "Stripe invoice create did not return an id" })
            );
          }
          const finalized =
            invoice.status === "draft"
              ? yield* stripeTryPromise("stripe invoice finalize failed", () =>
                  client.invoices.finalizeInvoice(invoice.id!)
                )
              : invoice;
          return {
            id: finalized.id ?? invoice.id,
            customerId: input.customerId,
            amountCents: input.amountCents,
            status: finalized.status ?? "open",
            hostedInvoiceUrl: finalized.hosted_invoice_url,
          };
        });

      const createPortalSession = (input: PortalSessionInput) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const session = yield* stripeTryPromise("stripe portal session create failed", () =>
            client.billingPortal.sessions.create({
              customer: input.customerId,
              return_url: input.returnUrl,
            })
          );
          return { url: session.url, customerId: input.customerId };
        });

      return StripeBillingService.of({
        setup,
        createCustomer,
        createSubscription,
        createInvoice,
        createPortalSession,
      });
    })
  );
}
