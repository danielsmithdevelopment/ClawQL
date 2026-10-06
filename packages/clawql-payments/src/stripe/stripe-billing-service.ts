import { Context, Effect, Layer } from "effect";
import { type Named, type UserId } from "clawql-gdp";
import { getPlanDefinition, type ClawqlPlanId } from "../plans/tiers.js";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import type { ConfigError } from "../errors/payment-errors.js";
import type { VerifiedCheckoutSessionUser } from "../proofs/verified-checkout-session-user.js";
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
  /** Internal ClawQL user id (`usr_…`) — CPC tenant. Never a client-supplied supabase id. */
  clawqlUserId?: string;
  /**
   * @deprecated Ignored. Binding `clawql_supabase_user_id` requires
   * {@link createCheckoutSessionWithVerifiedUserEffect} + VerifiedCheckoutSessionUser proof.
   */
  supabaseUserId?: string;
  env?: NodeJS.ProcessEnv;
};

/** Checkout input without the deprecated raw supabaseUserId field. */
export type CheckoutSessionVerifiedInput = Omit<CheckoutSessionInput, "supabaseUserId">;

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
  clawqlUserId?: string;
}): Record<string, string> {
  const meta: Record<string, string> = {
    clawql_provision_org: "1",
    clawql_org_name: input.orgName.trim(),
    clawql_plan: input.plan,
    clawql_billing_mode: input.billingMode ?? "stripe_checkout",
    clawql_owner_email: input.ownerEmail.trim(),
  };
  const clawqlUserId = input.clawqlUserId?.trim();
  if (clawqlUserId) {
    meta.clawql_user_id = clawqlUserId;
  }
  return meta;
}

/**
 * Sensitive: binds clawql_supabase_user_id. Demands VerifiedCheckoutSessionUser
 * about the exact named user (gdp-ts).
 */
export function buildCheckoutSessionMetadataWithVerifiedUser<U>(
  user: Named<U, UserId>,
  _proof: VerifiedCheckoutSessionUser<U>,
  input: {
    orgName: string;
    plan: CheckoutSessionPlan;
    ownerEmail: string;
    billingMode?: CheckoutBillingMode;
    clawqlUserId?: string;
  }
): Record<string, string> {
  return {
    ...buildCheckoutSessionMetadata(input),
    clawql_supabase_user_id: user.value,
  };
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
    readonly createCheckoutSessionWithVerifiedUser: <U>(
      user: Named<U, UserId>,
      proof: VerifiedCheckoutSessionUser<U>,
      input: CheckoutSessionVerifiedInput
    ) => Effect.Effect<CheckoutSessionResult, StripeApiError | StripeNotConfigured>;
    readonly deleteCustomer: (
      customerId: string
    ) => Effect.Effect<void, StripeApiError | StripeNotConfigured>;
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

      const validateCheckoutInput = (input: CheckoutSessionVerifiedInput) =>
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
          return {
            orgName,
            ownerEmail,
            successUrl,
            cancelUrl,
            plan: input.plan,
            billingMode,
            clawqlUserId: input.clawqlUserId?.trim() || undefined,
            runEnv: input.env ?? env,
          } as const;
        });

      const createCheckoutWithMetadata = (
        validated: {
          orgName: string;
          ownerEmail: string;
          successUrl: string;
          cancelUrl: string;
          plan: CheckoutSessionPlan;
          billingMode: CheckoutBillingMode;
          clawqlUserId?: string;
          runEnv: NodeJS.ProcessEnv;
        },
        metadata: Record<string, string>
      ) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const priceId = yield* resolvePriceId(validated.plan, validated.runEnv);
          const session = yield* stripeTryPromise("stripe checkout session create failed", () =>
            client.checkout.sessions.create({
              mode: "subscription",
              customer_email: validated.ownerEmail,
              line_items: [{ price: priceId, quantity: 1 }],
              success_url: validated.successUrl,
              cancel_url: validated.cancelUrl,
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
            plan: validated.plan,
            priceId,
          };
        });

      /** Non-supabase path — never binds clawql_supabase_user_id (raw supabaseUserId ignored). */
      const createCheckoutSession = (input: CheckoutSessionInput) =>
        Effect.gen(function* () {
          const validated = yield* validateCheckoutInput(input);
          const metadata = buildCheckoutSessionMetadata({
            orgName: validated.orgName,
            plan: validated.plan,
            ownerEmail: validated.ownerEmail,
            billingMode: validated.billingMode,
            clawqlUserId: validated.clawqlUserId,
          });
          return yield* createCheckoutWithMetadata(validated, metadata);
        });

      /**
       * Sensitive: Checkout with clawql_supabase_user_id. Demands
       * VerifiedCheckoutSessionUser about the named user (gdp-ts).
       */
      const createCheckoutSessionWithVerifiedUser = <U>(
        user: Named<U, UserId>,
        proof: VerifiedCheckoutSessionUser<U>,
        input: CheckoutSessionVerifiedInput
      ) =>
        Effect.gen(function* () {
          const validated = yield* validateCheckoutInput(input);
          const metadata = buildCheckoutSessionMetadataWithVerifiedUser(user, proof, {
            orgName: validated.orgName,
            plan: validated.plan,
            ownerEmail: validated.ownerEmail,
            billingMode: validated.billingMode,
            clawqlUserId: validated.clawqlUserId,
          });
          return yield* createCheckoutWithMetadata(validated, metadata);
        });

      const deleteCustomer = (customerId: string) =>
        Effect.gen(function* () {
          const id = customerId.trim();
          if (!id) {
            return yield* Effect.fail(new StripeApiError({ reason: "customerId is required" }));
          }
          const client = yield* stripeClient.getClient();
          yield* stripeTryPromise("stripe customer delete failed", () => client.customers.del(id));
        });

      return StripeBillingService.of({
        setup,
        createCustomer,
        createSubscription,
        createInvoice,
        createPortalSession,
        createCheckoutSession,
        createCheckoutSessionWithVerifiedUser,
        deleteCustomer,
      });
    })
  );
}

/**
 * Free-function entry: create Checkout Session bound to a verified named user.
 * Demands VerifiedCheckoutSessionUser (gdp-ts).
 */
export function createCheckoutSessionWithVerifiedUserEffect<U>(
  user: Named<U, UserId>,
  proof: VerifiedCheckoutSessionUser<U>,
  input: CheckoutSessionVerifiedInput
): Effect.Effect<
  CheckoutSessionResult,
  StripeApiError | StripeNotConfigured,
  StripeBillingService
> {
  return Effect.gen(function* () {
    const billing = yield* StripeBillingService;
    return yield* billing.createCheckoutSessionWithVerifiedUser(user, proof, input);
  });
}
