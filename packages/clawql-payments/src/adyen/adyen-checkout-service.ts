import { Context, Effect, Layer } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildAdyenPaymentAuthorizedEntry,
  buildAdyenPaymentFailedEntry,
  buildAdyenSessionCreatedEntry,
  buildAdyenWebhookProcessedEntry,
} from "../audit/events.js";
import {
  adyenApiKey,
  adyenApiVersion,
  adyenCheckoutApiBase,
  adyenClientKey,
  adyenHmacKey,
  adyenMerchantAccount,
  isAdyenConfigured,
  isAdyenEnabled,
} from "./config.js";
import { AdyenError, verifyAdyenWebhookHmac, type AdyenNotificationRequestItem } from "./hmac.js";

export type CreateAdyenSessionInput = {
  /** Major units (e.g. 29.99 → 2999 minor). */
  amountUsd: number;
  currency?: string;
  reference?: string;
  returnUrl?: string;
  countryCode?: string;
  shopperReference?: string;
  shopperEmail?: string;
  correlationId?: string;
  tenantId?: string;
};

export type AdyenSessionResult = {
  id: string;
  sessionData?: string;
  reference: string;
  amount: { value: number; currency: string };
  clientKey?: string;
  raw: Record<string, unknown>;
};

export type CreateAdyenPaymentInput = {
  amountUsd: number;
  currency?: string;
  reference?: string;
  returnUrl?: string;
  paymentMethod: Record<string, unknown>;
  shopperReference?: string;
  shopperEmail?: string;
  correlationId?: string;
  tenantId?: string;
};

export type AdyenPaymentResult = {
  resultCode: string;
  pspReference?: string;
  refusalReason?: string;
  raw: Record<string, unknown>;
};

export type ProcessAdyenWebhookInput = {
  notificationItems: Array<{ NotificationRequestItem?: AdyenNotificationRequestItem }>;
  requireHmac?: boolean;
  correlationId?: string;
  tenantId?: string;
};

export type ProcessAdyenWebhookResult = {
  processed: number;
  skipped: number;
  events: Array<{ eventCode: string; success: boolean; pspReference?: string }>;
};

/** Effect service for Adyen Checkout sessions, payments, and webhooks. */
export class AdyenCheckoutService extends Context.Tag("clawql/AdyenCheckoutService")<
  AdyenCheckoutService,
  {
    readonly createSession: (
      input: CreateAdyenSessionInput
    ) => Effect.Effect<AdyenSessionResult, AdyenError>;
    readonly createPayment: (
      input: CreateAdyenPaymentInput
    ) => Effect.Effect<AdyenPaymentResult, AdyenError>;
    readonly processWebhook: (
      input: ProcessAdyenWebhookInput
    ) => Effect.Effect<ProcessAdyenWebhookResult, AdyenError>;
  }
>() {}

function toMinorUnits(amountUsd: number, currency: string): number {
  const decimals = currency.toUpperCase() === "JPY" || currency.toUpperCase() === "KRW" ? 0 : 2;
  return Math.round(amountUsd * 10 ** decimals);
}

export function adyenCheckoutLiveLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<AdyenCheckoutService, never, PaymentAuditService> {
  return Layer.effect(
    AdyenCheckoutService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const ensureConfigured = () => {
        if (!isAdyenEnabled(env) || !isAdyenConfigured(env)) {
          throw new AdyenError({
            reason:
              "Adyen disabled or not configured — set CLAWQL_ADYEN_ENABLED=1, ADYEN_API_KEY, ADYEN_MERCHANT_ACCOUNT",
          });
        }
        const apiKey = adyenApiKey(env);
        const merchant = adyenMerchantAccount(env);
        if (!apiKey || !merchant) {
          throw new AdyenError({
            reason: "Adyen not configured — set ADYEN_API_KEY and ADYEN_MERCHANT_ACCOUNT",
          });
        }
        return { apiKey, merchant };
      };

      const adyenFetch = async (
        path: string,
        body: Record<string, unknown>
      ): Promise<Record<string, unknown>> => {
        const { apiKey } = ensureConfigured();
        const url = `${adyenCheckoutApiBase(env)}/${adyenApiVersion(env)}${path}`;
        const res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify(body),
        });
        const raw = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          const msg =
            typeof raw.message === "string"
              ? raw.message
              : typeof raw.errorCode === "string"
                ? raw.errorCode
                : JSON.stringify(raw).slice(0, 300);
          throw new AdyenError({
            reason: `Adyen API ${path} failed (${res.status}): ${msg}`,
          });
        }
        return raw;
      };

      const createSession = (input: CreateAdyenSessionInput) =>
        Effect.gen(function* () {
          const { merchant } = ensureConfigured();
          const currency = (input.currency ?? "USD").toUpperCase();
          const value = toMinorUnits(input.amountUsd, currency);
          const reference =
            input.reference?.trim() ||
            `clawql_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

          const raw = yield* Effect.tryPromise({
            try: () =>
              adyenFetch("/sessions", {
                merchantAccount: merchant,
                amount: { currency, value },
                reference,
                returnUrl: input.returnUrl ?? "https://example.com/adyen/return",
                countryCode: input.countryCode ?? "US",
                shopperReference: input.shopperReference,
                shopperEmail: input.shopperEmail,
                channel: "Web",
              }),
            catch: (cause) =>
              cause instanceof AdyenError
                ? cause
                : new AdyenError({
                    reason: cause instanceof Error ? cause.message : String(cause),
                    cause,
                  }),
          });

          const result: AdyenSessionResult = {
            id: String(raw.id ?? ""),
            sessionData: typeof raw.sessionData === "string" ? raw.sessionData : undefined,
            reference,
            amount: { value, currency },
            clientKey: adyenClientKey(env),
            raw,
          };

          yield* audit
            .appendEntry(
              buildAdyenSessionCreatedEntry({
                tenantId: input.tenantId ?? "default",
                sessionId: result.id,
                amountUsd: input.amountUsd,
                reference,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return result;
        });

      const createPayment = (input: CreateAdyenPaymentInput) =>
        Effect.gen(function* () {
          const { merchant } = ensureConfigured();
          const currency = (input.currency ?? "USD").toUpperCase();
          const value = toMinorUnits(input.amountUsd, currency);
          const reference =
            input.reference?.trim() ||
            `clawql_pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

          const raw = yield* Effect.tryPromise({
            try: () =>
              adyenFetch("/payments", {
                merchantAccount: merchant,
                amount: { currency, value },
                reference,
                returnUrl: input.returnUrl ?? "https://example.com/adyen/return",
                paymentMethod: input.paymentMethod,
                shopperReference: input.shopperReference,
                shopperEmail: input.shopperEmail,
                channel: "Web",
              }),
            catch: (cause) =>
              cause instanceof AdyenError
                ? cause
                : new AdyenError({
                    reason: cause instanceof Error ? cause.message : String(cause),
                    cause,
                  }),
          });

          const resultCode = String(raw.resultCode ?? "Unknown");
          const pspReference = typeof raw.pspReference === "string" ? raw.pspReference : undefined;
          const refusalReason =
            typeof raw.refusalReason === "string" ? raw.refusalReason : undefined;

          if (
            resultCode === "Authorised" ||
            resultCode === "Received" ||
            resultCode === "Pending"
          ) {
            yield* audit
              .appendEntry(
                buildAdyenPaymentAuthorizedEntry({
                  tenantId: input.tenantId ?? "default",
                  pspReference,
                  amountUsd: input.amountUsd,
                  reference,
                  resultCode,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          } else {
            yield* audit
              .appendEntry(
                buildAdyenPaymentFailedEntry({
                  tenantId: input.tenantId ?? "default",
                  reference,
                  reason: refusalReason ?? resultCode,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }

          return {
            resultCode,
            pspReference,
            refusalReason,
            raw,
          } satisfies AdyenPaymentResult;
        });

      const processWebhook = (input: ProcessAdyenWebhookInput) =>
        Effect.gen(function* () {
          const hmac = adyenHmacKey(env);
          const requireHmac = input.requireHmac !== false && Boolean(hmac);
          const events: ProcessAdyenWebhookResult["events"] = [];
          let processed = 0;
          let skipped = 0;

          for (const wrapper of input.notificationItems ?? []) {
            const item = wrapper.NotificationRequestItem;
            if (!item) {
              skipped += 1;
              continue;
            }
            if (requireHmac && hmac) {
              if (!verifyAdyenWebhookHmac(item, hmac)) {
                skipped += 1;
                continue;
              }
            } else if (requireHmac && !hmac) {
              return yield* Effect.fail(
                new AdyenError({
                  reason: "ADYEN_HMAC_KEY required to verify webhooks (or set requireHmac:false)",
                })
              );
            }

            const eventCode = String(item.eventCode ?? "UNKNOWN");
            const success = String(item.success ?? "").toLowerCase() === "true";
            const pspReference =
              typeof item.pspReference === "string" ? item.pspReference : undefined;
            const amountUsd =
              item.amount && typeof item.amount.value === "number"
                ? item.amount.value / 100
                : undefined;

            events.push({ eventCode, success, pspReference });
            processed += 1;

            if (eventCode === "AUTHORISATION") {
              if (success) {
                yield* audit
                  .appendEntry(
                    buildAdyenPaymentAuthorizedEntry({
                      tenantId: input.tenantId ?? "default",
                      pspReference,
                      amountUsd,
                      reference:
                        typeof item.merchantReference === "string"
                          ? item.merchantReference
                          : undefined,
                      resultCode: "Authorised",
                      correlationId: input.correlationId,
                    })
                  )
                  .pipe(Effect.catchAll(() => Effect.void));
              } else {
                yield* audit
                  .appendEntry(
                    buildAdyenPaymentFailedEntry({
                      tenantId: input.tenantId ?? "default",
                      reference:
                        typeof item.merchantReference === "string"
                          ? item.merchantReference
                          : pspReference,
                      reason: "AUTHORISATION success=false",
                      correlationId: input.correlationId,
                    })
                  )
                  .pipe(Effect.catchAll(() => Effect.void));
              }
            }

            yield* audit
              .appendEntry(
                buildAdyenWebhookProcessedEntry({
                  tenantId: input.tenantId ?? "default",
                  eventCode,
                  success,
                  pspReference,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }

          return { processed, skipped, events };
        });

      return AdyenCheckoutService.of({ createSession, createPayment, processWebhook });
    })
  );
}
