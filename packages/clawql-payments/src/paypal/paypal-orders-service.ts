import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildPaypalCaptureFailedEntry,
  buildPaypalOrderCapturedEntry,
  buildPaypalOrderCreatedEntry,
} from "../audit/events.js";
import { isPaypalConfigured, isPaypalEnabled, paypalApiBase } from "./config.js";

export class PaypalError extends Data.TaggedError("PaypalError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type PaypalAccessToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type CreatePaypalOrderInput = {
  amountUsd: number;
  currency?: string;
  description?: string;
  returnUrl?: string;
  cancelUrl?: string;
  correlationId?: string;
  tenantId?: string;
};

export type PaypalOrderResult = {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
  raw: Record<string, unknown>;
};

/** Effect service for PayPal Orders v2 (create + capture). */
export class PaypalOrdersService extends Context.Tag("clawql/PaypalOrdersService")<
  PaypalOrdersService,
  {
    readonly createOrder: (
      input: CreatePaypalOrderInput
    ) => Effect.Effect<PaypalOrderResult, PaypalError>;
    readonly captureOrder: (input: {
      orderId: string;
      correlationId?: string;
      tenantId?: string;
    }) => Effect.Effect<PaypalOrderResult, PaypalError>;
  }
>() {}

async function fetchAccessToken(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string> {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const secret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) {
    throw new PaypalError({
      reason: "PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET",
    });
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetchImpl(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new PaypalError({
      reason: `PayPal OAuth failed (${res.status}): ${body.slice(0, 200)}`,
    });
  }
  const json = (await res.json()) as PaypalAccessToken;
  if (!json.access_token) {
    throw new PaypalError({ reason: "PayPal OAuth response missing access_token" });
  }
  return json.access_token;
}

export function paypalOrdersLiveLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<PaypalOrdersService, never, PaymentAuditService> {
  return Layer.effect(
    PaypalOrdersService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      let cachedToken: { token: string; expiresAt: number } | null = null;

      const getToken = () =>
        Effect.tryPromise({
          try: async () => {
            if (!isPaypalEnabled(env) || !isPaypalConfigured(env)) {
              throw new PaypalError({
                reason:
                  "PayPal disabled or not configured — set CLAWQL_PAYPAL_ENABLED=1 and PAYPAL_CLIENT_ID/SECRET",
              });
            }
            if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
              return cachedToken.token;
            }
            const token = await fetchAccessToken(env, fetchImpl);
            cachedToken = { token, expiresAt: Date.now() + 50 * 60_000 };
            return token;
          },
          catch: (cause) =>
            cause instanceof PaypalError
              ? cause
              : new PaypalError({
                  reason: cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
        });

      const createOrder = (input: CreatePaypalOrderInput) =>
        Effect.gen(function* () {
          const token = yield* getToken();
          const currency = (input.currency ?? "USD").toUpperCase();
          const value = input.amountUsd.toFixed(2);
          const order = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetchImpl(`${paypalApiBase(env)}/v2/checkout/orders`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                  Prefer: "return=representation",
                },
                body: JSON.stringify({
                  intent: "CAPTURE",
                  purchase_units: [
                    {
                      amount: { currency_code: currency, value },
                      description: input.description ?? "ClawQL payment",
                    },
                  ],
                  application_context: {
                    return_url: input.returnUrl,
                    cancel_url: input.cancelUrl,
                    user_action: "PAY_NOW",
                  },
                }),
              });
              const raw = (await res.json()) as Record<string, unknown>;
              if (!res.ok) {
                throw new PaypalError({
                  reason: `PayPal create order failed (${res.status}): ${JSON.stringify(raw).slice(0, 300)}`,
                });
              }
              return {
                id: String(raw.id ?? ""),
                status: String(raw.status ?? "UNKNOWN"),
                links: Array.isArray(raw.links)
                  ? (raw.links as Array<{ rel: string; href: string }>)
                  : undefined,
                raw,
              } satisfies PaypalOrderResult;
            },
            catch: (cause) =>
              cause instanceof PaypalError
                ? cause
                : new PaypalError({
                    reason: cause instanceof Error ? cause.message : String(cause),
                    cause,
                  }),
          });

          yield* audit
            .appendEntry(
              buildPaypalOrderCreatedEntry({
                tenantId: input.tenantId ?? "default",
                orderId: order.id,
                amountUsd: input.amountUsd,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return order;
        });

      const captureOrder = (input: {
        orderId: string;
        correlationId?: string;
        tenantId?: string;
      }) =>
        Effect.gen(function* () {
          const token = yield* getToken();
          const captured = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetchImpl(
                `${paypalApiBase(env)}/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Prefer: "return=representation",
                  },
                }
              );
              const raw = (await res.json()) as Record<string, unknown>;
              if (!res.ok) {
                throw new PaypalError({
                  reason: `PayPal capture failed (${res.status}): ${JSON.stringify(raw).slice(0, 300)}`,
                });
              }
              return {
                id: String(raw.id ?? input.orderId),
                status: String(raw.status ?? "UNKNOWN"),
                links: Array.isArray(raw.links)
                  ? (raw.links as Array<{ rel: string; href: string }>)
                  : undefined,
                raw,
              } satisfies PaypalOrderResult;
            },
            catch: (cause) =>
              cause instanceof PaypalError
                ? cause
                : new PaypalError({
                    reason: cause instanceof Error ? cause.message : String(cause),
                    cause,
                  }),
          }).pipe(
            Effect.tapError((err) =>
              audit
                .appendEntry(
                  buildPaypalCaptureFailedEntry({
                    tenantId: input.tenantId ?? "default",
                    orderId: input.orderId,
                    reason: err.reason,
                    correlationId: input.correlationId,
                  })
                )
                .pipe(Effect.catchAll(() => Effect.void))
            )
          );

          const amountUsd = (() => {
            try {
              const units = (captured.raw.purchase_units as Array<Record<string, unknown>>) ?? [];
              const payments = units[0]?.payments as Record<string, unknown> | undefined;
              const caps = (payments?.captures as Array<Record<string, unknown>>) ?? [];
              const amt = caps[0]?.amount as { value?: string } | undefined;
              return amt?.value ? Number.parseFloat(amt.value) : undefined;
            } catch {
              return undefined;
            }
          })();

          yield* audit
            .appendEntry(
              buildPaypalOrderCapturedEntry({
                tenantId: input.tenantId ?? "default",
                orderId: captured.id,
                amountUsd,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return captured;
        });

      return PaypalOrdersService.of({ createOrder, captureOrder });
    })
  );
}
