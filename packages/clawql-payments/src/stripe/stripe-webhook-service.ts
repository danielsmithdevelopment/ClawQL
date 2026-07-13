import Stripe from "stripe";
import { Context, Effect, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { buildPaymentWormEntry, buildStripeInvoicePaidEntry } from "../audit/events.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import type { ConfigError } from "../errors/payment-errors.js";
import type { PaymentError } from "../errors/payment-errors.js";
import { StripeSignatureError } from "./stripe-errors.js";

export type StripeWebhookVerifyResult =
  { ok: true; event: Stripe.Event } | { ok: false; reason: string };

export type ProcessStripeWebhookOptions = {
  tenantId?: string;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
};

export type ProcessStripeWebhookResult = {
  handled: boolean;
  eventType: string;
  eventId: string;
};

function tenantFromEvent(event: Stripe.Event, fallbackTenantId: string): string {
  const object = event.data.object as { metadata?: Record<string, string> };
  return object.metadata?.tenant_id?.trim() || fallbackTenantId;
}

export function verifyStripeWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): StripeWebhookVerifyResult {
  if (!secret.trim()) {
    return { ok: false, reason: "webhook secret is required" };
  }
  if (!signature.trim()) {
    return { ok: false, reason: "Stripe-Signature header is required" };
  }

  try {
    const event = Stripe.webhooks.constructEvent(payload, signature, secret);
    return { ok: true, event };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

/** Effect service for Stripe webhook verification and WORM-audited event handling. */
export class StripeWebhookService extends Context.Tag("clawql/StripeWebhookService")<
  StripeWebhookService,
  {
    readonly verifySignature: (
      payload: string | Buffer,
      signature: string,
      secret: string
    ) => Effect.Effect<Stripe.Event, StripeSignatureError>;
    readonly processEvent: (
      event: Stripe.Event,
      options?: ProcessStripeWebhookOptions
    ) => Effect.Effect<ProcessStripeWebhookResult, ConfigError | PaymentError>;
    readonly verifyAndProcess: (input: {
      payload: string | Buffer;
      signature: string;
      secret: string;
      tenantId?: string;
      correlationId?: string;
      env?: NodeJS.ProcessEnv;
    }) => Effect.Effect<
      ProcessStripeWebhookResult,
      StripeSignatureError | ConfigError | PaymentError
    >;
  }
>() {}

export function stripeWebhookLiveLayer(): Layer.Layer<
  StripeWebhookService,
  never,
  PaymentsConfigService | PaymentAuditService
> {
  return Layer.effect(
    StripeWebhookService,
    Effect.gen(function* () {
      const configService = yield* PaymentsConfigService;
      const audit = yield* PaymentAuditService;

      const verifySignature = (payload: string | Buffer, signature: string, secret: string) =>
        Effect.sync(() => verifyStripeWebhookSignature(payload, signature, secret)).pipe(
          Effect.flatMap((result) =>
            result.ok
              ? Effect.succeed(result.event)
              : Effect.fail(new StripeSignatureError({ reason: result.reason }))
          )
        );

      const processEvent = (event: Stripe.Event, options: ProcessStripeWebhookOptions = {}) =>
        Effect.gen(function* () {
          const env = options.env ?? process.env;
          const config = yield* configService.load();
          const tenantId = options.tenantId ?? config.tenantId ?? "default";

          switch (event.type) {
            case "invoice.paid": {
              const invoice = event.data.object as Stripe.Invoice;
              const amountUsd = (invoice.amount_paid ?? 0) / 100;
              yield* audit.appendEntry(
                buildStripeInvoicePaidEntry({
                  tenantId: tenantFromEvent(event, tenantId),
                  amountUsd,
                  plan: config.plan,
                  correlationId: options.correlationId ?? event.id,
                })
              );
              break;
            }
            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              yield* audit.appendEntry(
                buildPaymentWormEntry({
                  eventKind: "STRIPE_PAYMENT_FAILED",
                  summary: `Stripe invoice payment failed for ${invoice.id}`,
                  correlationId: options.correlationId ?? event.id,
                  payload: {
                    provider: "stripe",
                    amount_usd: (invoice.amount_due ?? 0) / 100,
                    tenant_id: tenantFromEvent(event, tenantId),
                    plan: config.plan,
                  },
                })
              );
              break;
            }
            case "customer.subscription.created": {
              const subscription = event.data.object as Stripe.Subscription;
              yield* audit.appendEntry(
                buildPaymentWormEntry({
                  eventKind: "STRIPE_SUBSCRIPTION_CREATED",
                  summary: `Stripe subscription created ${subscription.id}`,
                  correlationId: options.correlationId ?? event.id,
                  payload: {
                    provider: "stripe",
                    tenant_id: tenantFromEvent(event, tenantId),
                    plan: config.plan,
                  },
                })
              );
              break;
            }
            default:
              return {
                handled: false,
                eventType: event.type,
                eventId: event.id,
              };
          }

          return {
            handled: true,
            eventType: event.type,
            eventId: event.id,
          };
        });

      const verifyAndProcess = (input: {
        payload: string | Buffer;
        signature: string;
        secret: string;
        tenantId?: string;
        correlationId?: string;
        env?: NodeJS.ProcessEnv;
      }) =>
        Effect.gen(function* () {
          const event = yield* verifySignature(input.payload, input.signature, input.secret);
          return yield* processEvent(event, {
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            env: input.env,
          });
        });

      return StripeWebhookService.of({
        verifySignature,
        processEvent,
        verifyAndProcess,
      });
    })
  );
}
