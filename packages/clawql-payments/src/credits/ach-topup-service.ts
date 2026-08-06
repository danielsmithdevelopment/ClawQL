/**
 * Bank-linked credit top-ups via Stripe Financial Connections + ACH (`us_bank_account`).
 *
 * Prefer this over a raw Plaid SDK: Stripe FC commonly uses Plaid (and other aggregators)
 * behind the Link UI while keeping one Stripe customer, PaymentIntent, and webhook path.
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import type Stripe from "stripe";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { buildBankLinkedEntry, buildCreditTopupPendingEntry } from "../audit/events.js";
import { StripeClientService, stripeTryPromise } from "../stripe/stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "../stripe/stripe-errors.js";
import {
  creditsReturnUrl,
  isAchTopupDryRun,
  isAchTopupEnabled,
  isCreditsEnabled,
} from "./config.js";
import { CreditsLedgerService } from "./ledger.js";
import { CreditsError, CreditsService } from "./credits-service.js";

export class AchTopupError extends Data.TaggedError("AchTopupError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type CreateBankLinkSessionInput = {
  customerId: string;
  tenantId?: string;
  correlationId?: string;
  returnUrl?: string;
};

export type BankLinkSessionResult = {
  id: string;
  clientSecret: string;
  customerId: string;
  /** True when Stripe was not called (dry-run). */
  dryRun: boolean;
};

export type CreateAchTopupInput = {
  customerId: string;
  /** Major USD units (e.g. 25 → $25.00). */
  amountUsd: number;
  /** Stripe PaymentMethod id (`pm_…`) of type `us_bank_account`. */
  paymentMethodId?: string;
  tenantId?: string;
  correlationId?: string;
  description?: string;
};

export type AchTopupResult = {
  paymentIntentId: string;
  status: string;
  amountCents: number;
  clientSecret?: string;
  dryRun: boolean;
  settledImmediately: boolean;
};

const TOPUP_META_KEY = "clawql_credit_topup";

/** Effect service: Financial Connections link + ACH debit → credit ledger. */
export class AchTopupService extends Context.Tag("clawql/AchTopupService")<
  AchTopupService,
  {
    readonly createBankLinkSession: (
      input: CreateBankLinkSessionInput
    ) => Effect.Effect<BankLinkSessionResult, AchTopupError | StripeNotConfigured | StripeApiError>;
    readonly createTopup: (
      input: CreateAchTopupInput
    ) => Effect.Effect<AchTopupResult, AchTopupError | StripeNotConfigured | StripeApiError>;
  }
>() {}

export function achTopupLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  AchTopupService,
  never,
  PaymentAuditService | StripeClientService | CreditsService | CreditsLedgerService
> {
  return Layer.effect(
    AchTopupService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const stripeClient = yield* StripeClientService;
      const credits = yield* CreditsService;
      const ledger = yield* CreditsLedgerService;

      const createBankLinkSession = (input: CreateBankLinkSessionInput) =>
        Effect.gen(function* () {
          if (!(yield* isCreditsEnabled(env)) || !(yield* isAchTopupEnabled(env))) {
            return yield* Effect.fail(
              new AchTopupError({
                reason:
                  "ACH top-up disabled — set CLAWQL_CREDITS_ENABLED=1 and CLAWQL_ACH_TOPUP_ENABLED=1",
              })
            );
          }
          const tenantId = input.tenantId?.trim() || "default";
          const returnUrl = input.returnUrl?.trim() || (yield* creditsReturnUrl(env));

          if (yield* isAchTopupDryRun(env)) {
            const id = `fcs_dry_${Date.now().toString(36)}`;
            yield* audit
              .appendEntry(
                buildBankLinkedEntry({
                  tenantId,
                  customerId: input.customerId,
                  sessionId: id,
                  dryRun: true,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              clientSecret: `${id}_secret_dry`,
              customerId: input.customerId,
              dryRun: true,
            } satisfies BankLinkSessionResult;
          }

          const stripe = yield* stripeClient.getClient();
          const session = yield* stripeTryPromise(
            "financialConnections.sessions.create",
            (): Promise<Stripe.FinancialConnections.Session> =>
              stripe.financialConnections.sessions.create({
                account_holder: { type: "customer", customer: input.customerId },
                permissions: ["payment_method"],
                prefetch: ["balances"],
                ...(returnUrl ? { return_url: returnUrl } : {}),
              })
          );
          yield* audit
            .appendEntry(
              buildBankLinkedEntry({
                tenantId,
                customerId: input.customerId,
                sessionId: session.id,
                dryRun: false,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          if (!session.client_secret) {
            return yield* Effect.fail(
              new AchTopupError({
                reason: `Financial Connections session ${session.id} missing client_secret`,
              })
            );
          }
          return {
            id: session.id,
            clientSecret: session.client_secret,
            customerId: input.customerId,
            dryRun: false,
          } satisfies BankLinkSessionResult;
        });

      const createTopup = (input: CreateAchTopupInput) =>
        Effect.gen(function* () {
          if (!(yield* isCreditsEnabled(env)) || !(yield* isAchTopupEnabled(env))) {
            return yield* Effect.fail(
              new AchTopupError({
                reason:
                  "ACH top-up disabled — set CLAWQL_CREDITS_ENABLED=1 and CLAWQL_ACH_TOPUP_ENABLED=1",
              })
            );
          }
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new AchTopupError({ reason: "amountUsd must be > 0" }));
          }
          const amountCents = Math.round(input.amountUsd * 100);
          const tenantId = input.tenantId?.trim() || "default";

          if (yield* isAchTopupDryRun(env)) {
            const paymentIntentId = `pi_dry_${Date.now().toString(36)}`;
            yield* ledger
              .appendEntry({
                tenantId,
                kind: "topup_pending",
                deltaCents: 0,
                paymentIntentId,
                correlationId: input.correlationId,
                note: "dry-run ACH top-up pending",
              })
              .pipe(
                Effect.mapError(
                  (cause) => new AchTopupError({ reason: cause.reason, cause: cause.cause })
                )
              );
            yield* audit
              .appendEntry(
                buildCreditTopupPendingEntry({
                  tenantId,
                  amountUsd: amountCents / 100,
                  paymentIntentId,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            const settled = yield* credits
              .settleTopup({
                tenantId,
                paymentIntentId,
                amountCents,
                correlationId: input.correlationId,
              })
              .pipe(
                Effect.mapError(
                  (e) =>
                    new AchTopupError({
                      reason: e instanceof CreditsError ? e.reason : "settle failed",
                      cause: e,
                    })
                )
              );
            return {
              paymentIntentId,
              status: "succeeded",
              amountCents,
              dryRun: true,
              settledImmediately: !settled.alreadySettled,
            } satisfies AchTopupResult;
          }

          if (!input.paymentMethodId?.trim()) {
            return yield* Effect.fail(
              new AchTopupError({
                reason:
                  "paymentMethodId required for live ACH top-up (collect via Financial Connections)",
              })
            );
          }

          const stripe = yield* stripeClient.getClient();
          const pi = yield* stripeTryPromise(
            "paymentIntents.create",
            (): Promise<Stripe.PaymentIntent> =>
              stripe.paymentIntents.create({
                amount: amountCents,
                currency: "usd",
                customer: input.customerId,
                payment_method: input.paymentMethodId,
                payment_method_types: ["us_bank_account"],
                confirm: true,
                // Mandate acceptance is collected during Financial Connections / Link.
                off_session: true,
                description: input.description?.trim() || "ClawQL credit top-up",
                metadata: {
                  [TOPUP_META_KEY]: "1",
                  tenant_id: tenantId,
                },
              })
          );

          yield* ledger
            .appendEntry({
              tenantId,
              kind: "topup_pending",
              deltaCents: 0,
              paymentIntentId: pi.id,
              correlationId: input.correlationId,
              note: `ACH PI ${pi.status}`,
            })
            .pipe(
              Effect.mapError(
                (cause) => new AchTopupError({ reason: cause.reason, cause: cause.cause })
              )
            );
          yield* audit
            .appendEntry(
              buildCreditTopupPendingEntry({
                tenantId,
                amountUsd: amountCents / 100,
                paymentIntentId: pi.id,
                correlationId: input.correlationId ?? pi.id,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          let settledImmediately = false;
          if (pi.status === "succeeded") {
            const settled = yield* credits
              .settleTopup({
                tenantId,
                paymentIntentId: pi.id,
                amountCents,
                correlationId: input.correlationId ?? pi.id,
              })
              .pipe(
                Effect.mapError(
                  (e) =>
                    new AchTopupError({
                      reason: e instanceof CreditsError ? e.reason : "settle failed",
                      cause: e,
                    })
                )
              );
            settledImmediately = !settled.alreadySettled;
          }

          return {
            paymentIntentId: pi.id,
            status: pi.status,
            amountCents,
            clientSecret: pi.client_secret ?? undefined,
            dryRun: false,
            settledImmediately,
          } satisfies AchTopupResult;
        });

      return AchTopupService.of({
        createBankLinkSession,
        createTopup,
      });
    })
  );
}

export { TOPUP_META_KEY };
