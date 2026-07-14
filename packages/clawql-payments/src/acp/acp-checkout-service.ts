import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { resolvePaymentsDir } from "../config/paths.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { buildAcpCheckoutCompletedEntry, buildAcpCheckoutCreatedEntry } from "../audit/events.js";
import { StripeClientService, stripeTryPromise } from "../stripe/stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "../stripe/stripe-errors.js";
import { acpMerchantId, isAcpEnabled } from "./config.js";
import type {
  AcpCheckoutSession,
  AcpLineItem,
  AcpMoney,
  CompleteAcpCheckoutInput,
  CreateAcpCheckoutInput,
} from "./types.js";

export class AcpError extends Data.TaggedError("AcpError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function money(amount: number, currency: string): AcpMoney {
  return { amount: Math.round(amount), currency: currency.toUpperCase() };
}

function sessionsPath(env: NodeJS.ProcessEnv): string {
  return join(resolvePaymentsDir(env), "acp-checkout-sessions.json");
}

function isAcpDryRun(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CLAWQL_ACP_DRY_RUN?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

type SessionStore = Record<string, AcpCheckoutSession>;

async function loadStore(env: NodeJS.ProcessEnv): Promise<SessionStore> {
  const path = sessionsPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as SessionStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveStore(env: NodeJS.ProcessEnv, store: SessionStore): Promise<void> {
  const path = sessionsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/** Effect service for ACP merchant-side checkout sessions + Stripe SPT complete. */
export class AcpCheckoutService extends Context.Tag("clawql/AcpCheckoutService")<
  AcpCheckoutService,
  {
    readonly createSession: (
      input: CreateAcpCheckoutInput
    ) => Effect.Effect<AcpCheckoutSession, AcpError>;
    readonly getSession: (id: string) => Effect.Effect<AcpCheckoutSession, AcpError>;
    readonly completeSession: (
      input: CompleteAcpCheckoutInput
    ) => Effect.Effect<AcpCheckoutSession, AcpError | StripeNotConfigured | StripeApiError>;
  }
>() {}

export function acpCheckoutLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AcpCheckoutService, never, PaymentAuditService | StripeClientService> {
  return Layer.effect(
    AcpCheckoutService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const stripeClient = yield* StripeClientService;

      const createSession = (input: CreateAcpCheckoutInput) =>
        Effect.tryPromise({
          try: async () => {
            if (!isAcpEnabled(env)) {
              throw new AcpError({
                reason: "ACP disabled — set CLAWQL_ACP_ENABLED=1",
              });
            }
            if (!input.line_items?.length) {
              throw new AcpError({ reason: "line_items required" });
            }
            const currency = (input.currency ?? "usd").toLowerCase();
            const lineItems: AcpLineItem[] = input.line_items.map((li, idx) => {
              const unitMinor = Math.round(li.unit_amount * 100);
              const qty = Math.max(1, Math.floor(li.quantity));
              return {
                id: li.id?.trim() || `item_${idx + 1}`,
                name: li.name,
                quantity: qty,
                unit_amount: money(unitMinor, currency),
                total_amount: money(unitMinor * qty, currency),
              };
            });
            const subtotal = lineItems.reduce((sum, li) => sum + li.total_amount.amount, 0);
            const now = new Date().toISOString();
            const session: AcpCheckoutSession = {
              id: `acs_${randomUUID().replace(/-/g, "")}`,
              status: "ready_for_payment",
              currency,
              line_items: lineItems,
              totals: {
                subtotal: money(subtotal, currency),
                total: money(subtotal, currency),
              },
              buyer: input.buyer,
              payment_provider: "stripe",
              created_at: now,
              updated_at: now,
            };
            const store = await loadStore(env);
            store[session.id] = session;
            await saveStore(env, store);
            return session;
          },
          catch: (cause) =>
            cause instanceof AcpError
              ? cause
              : new AcpError({
                  reason: cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
        }).pipe(
          Effect.tap((session) =>
            audit
              .appendEntry(
                buildAcpCheckoutCreatedEntry({
                  tenantId: acpMerchantId(env),
                  checkoutSessionId: session.id,
                  amountUsd: session.totals.total.amount / 100,
                  correlationId: session.id,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void))
          )
        );

      const getSession = (id: string) =>
        Effect.tryPromise({
          try: async () => {
            const store = await loadStore(env);
            const session = store[id];
            if (!session) throw new AcpError({ reason: `Checkout session not found: ${id}` });
            return session;
          },
          catch: (cause) =>
            cause instanceof AcpError
              ? cause
              : new AcpError({
                  reason: cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
        });

      const completeSession = (input: CompleteAcpCheckoutInput) =>
        Effect.gen(function* () {
          if (!isAcpEnabled(env)) {
            return yield* Effect.fail(
              new AcpError({ reason: "ACP disabled — set CLAWQL_ACP_ENABLED=1" })
            );
          }
          const session = yield* getSession(input.checkout_session_id);
          if (session.status === "completed") return session;
          if (session.status === "canceled") {
            return yield* Effect.fail(new AcpError({ reason: "Checkout session canceled" }));
          }
          if (input.payment_data.provider !== "stripe") {
            return yield* Effect.fail(
              new AcpError({
                reason: `ACP complete currently supports stripe SPT; got ${input.payment_data.provider}`,
              })
            );
          }
          const token = input.payment_data.token.trim();
          if (!token) {
            return yield* Effect.fail(new AcpError({ reason: "payment_data.token required" }));
          }

          let paymentIntentId: string;
          if (isAcpDryRun(env) || !stripeClient.isConfigured()) {
            paymentIntentId = `pi_dry_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          } else {
            const stripe = yield* stripeClient.getClient();
            const intent = yield* stripeTryPromise(
              "stripe acp SPT paymentIntent create failed",
              () =>
                stripe.paymentIntents.create({
                  amount: session.totals.total.amount,
                  currency: session.currency,
                  confirm: true,
                  automatic_payment_methods: { enabled: true, allow_redirects: "never" },
                  // SPT field — Stripe agentic commerce; cast for SDK version variance.
                  payment_method_data: {
                    shared_payment_granted_token: token,
                  } as never,
                  metadata: {
                    clawql_acp_checkout_session_id: session.id,
                    clawql_acp_merchant: acpMerchantId(env),
                  },
                })
            );
            paymentIntentId = intent.id;
          }

          const now = new Date().toISOString();
          const completed: AcpCheckoutSession = {
            ...session,
            status: "completed",
            buyer: input.buyer ?? session.buyer,
            payment_intent_id: paymentIntentId,
            order: {
              id: `ord_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
              checkout_session_id: session.id,
            },
            updated_at: now,
          };

          yield* Effect.tryPromise({
            try: async () => {
              const store = await loadStore(env);
              store[completed.id] = completed;
              await saveStore(env, store);
            },
            catch: (cause) =>
              new AcpError({
                reason: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          });

          yield* audit
            .appendEntry(
              buildAcpCheckoutCompletedEntry({
                tenantId: acpMerchantId(env),
                checkoutSessionId: completed.id,
                amountUsd: completed.totals.total.amount / 100,
                paymentIntentId,
                correlationId: completed.id,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return completed;
        });

      return AcpCheckoutService.of({ createSession, getSession, completeSession });
    })
  );
}
