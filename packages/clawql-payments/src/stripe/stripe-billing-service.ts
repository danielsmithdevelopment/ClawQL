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

export type CheckoutSessionPlan = "pro" | "team";

export type CheckoutBillingMode = "stripe_checkout" | "hybrid";

export type CheckoutSessionInput = {
  plan: CheckoutSessionPlan;
  orgName: string;
  ownerEmail: string;
  successUrl: string;
  cancelUrl: string;
  billingMode?: CheckoutBillingMode;
  /** Supabase Auth user id — correlated into CPC metadata as clawql_supabase_user_id. */
  supabaseUserId?: string;
  env?: NodeJS.ProcessEnv;
};

export type CheckoutSessionResult = {
  id: string;
  url: string;
  plan: CheckoutSessionPlan;
  priceId: string;
};

/** CPC metadata for self-serve Checkout → provisionOrg (stripe-products-ops §4). */
export function buildCheckoutSessionMetadata(input: {
  orgName: string;
  plan: CheckoutSessionPlan;
  ownerEmail: string;
  billingMode?: CheckoutBillingMode;
  supabaseUserId?: string;
}): Record<string, string> {
  const meta: Record<string, string> = {
    clawql_provision_org: "1",
    clawql_org_name: input.orgName.trim(),
    clawql_plan: input.plan,
    clawql_billing_mode: input.billingMode ?? "stripe_checkout",
    clawql_owner_email: input.ownerEmail.trim(),
  };
  const supabaseUserId = input.supabaseUserId?.trim();
  if (supabaseUserId) {
    meta.clawql_supabase_user_id = supabaseUserId;
  }
  return meta;
}

function resolvePriceId(
  plan: ClawqlPlanId,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, StripeNotConfigured> {
  const fromPlan = getPlanDefinition(plan).stripe_price_id?.trim();
  const envKey =
    plan === "pro" ? "STRIPE_PRO_PRICE_ID" : plan === "team" ? "STRIPE_TEAM_PRICE_ID" : null;
  const fromEnv = envKey ? env[envKey]?.trim() : undefined;
  const priceId = fromPlan || fromEnv || null;
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
export class StripeBillingService extends Context.Service<
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
    readonly createCheckoutSession: (
      input: CheckoutSessionInput
    ) => Effect.Effect<CheckoutSessionResult, StripeApiError | StripeNotConfigured>;
  }
>()("clawql/StripeBillingService") {}

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
          const priceId = yield* resolvePriceId(input.plan, input.env ?? env);
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

      const createCheckoutSession = (input: CheckoutSessionInput) =>
        Effect.gen(function* () {
          const orgName = input.orgName?.trim() ?? "";
          const ownerEmail = input.ownerEmail?.trim() ?? "";
          const successUrl = input.successUrl?.trim() ?? "";
          const cancelUrl = input.cancelUrl?.trim() ?? "";
          if (!orgName) {
            return yield* Effect.fail(
              new StripeApiError({ reason: "orgName is required for Checkout Session" })
            );
          }
          if (!ownerEmail) {
            return yield* Effect.fail(
              new StripeApiError({ reason: "ownerEmail is required for Checkout Session" })
            );
          }
          if (!successUrl) {
            return yield* Effect.fail(
              new StripeApiError({ reason: "successUrl is required for Checkout Session" })
            );
          }
          if (!cancelUrl) {
            return yield* Effect.fail(
              new StripeApiError({ reason: "cancelUrl is required for Checkout Session" })
            );
          }
          if (input.plan !== "pro" && input.plan !== "team") {
            return yield* Effect.fail(
              new StripeApiError({ reason: 'plan must be "pro" or "team"' })
            );
          }
          const billingMode = input.billingMode ?? "stripe_checkout";
          if (billingMode !== "stripe_checkout" && billingMode !== "hybrid") {
            return yield* Effect.fail(
              new StripeApiError({
                reason: 'billingMode must be "stripe_checkout" or "hybrid"',
              })
            );
          }

          const runEnv = input.env ?? env;
          const client = yield* stripeClient.getClient();
          const priceId = yield* resolvePriceId(input.plan, runEnv);
          const metadata = buildCheckoutSessionMetadata({
            orgName,
            plan: input.plan,
            ownerEmail,
            billingMode,
            supabaseUserId: input.supabaseUserId,
          });
          const session = yield* stripeTryPromise("stripe checkout session create failed", () =>
            client.checkout.sessions.create({
              mode: "subscription",
              customer_email: ownerEmail,
              line_items: [{ price: priceId, quantity: 1 }],
              success_url: successUrl,
              cancel_url: cancelUrl,
              metadata,
              subscription_data: { metadata },
            })
          );
          if (!session.id || !session.url) {
            return yield* Effect.fail(
              new StripeApiError({
                reason: "Stripe Checkout Session create did not return id and url",
              })
            );
          }
          return {
            id: session.id,
            url: session.url,
            plan: input.plan,
            priceId,
          };
        });

      return StripeBillingService.of({
        setup,
        createCustomer,
        createSubscription,
        createInvoice,
        createPortalSession,
        createCheckoutSession,
      });
    })
  );
}
