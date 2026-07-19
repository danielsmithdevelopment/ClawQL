/**
 * Platform creator payouts: Stripe Connect (bank) + live Base USDC sends.
 *
 * Money-out complement to agentic ingress rails (x402/MPP/ACP/AP2).
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import type Stripe from "stripe";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildConnectAccountCreatedEntry,
  buildPayoutFailedEntry,
  buildPayoutInitiatedEntry,
  buildPayoutPaidEntry,
} from "../audit/events.js";
import { StripeClientService, stripeTryPromise } from "../stripe/stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "../stripe/stripe-errors.js";
import {
  isPayoutsDryRun,
  isPayoutsEnabled,
  payoutsDefaultRefreshUrl,
  payoutsDefaultReturnUrl,
} from "./config.js";
import {
  getCreatorPayoutPreference,
  setCreatorPayoutPreference,
  type CreatorPayoutPreference,
  type PayoutMethod,
} from "./preferences.js";
import { UsdcSendError, sendUsdcPayout } from "./usdc-send.js";

export class PayoutError extends Data.TaggedError("PayoutError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type ConnectAccountResult = {
  id: string;
  email?: string;
  type: string;
  dryRun: boolean;
};

export type ConnectOnboardingLinkResult = {
  url: string;
  accountId: string;
  dryRun: boolean;
};

export type PayoutResult = {
  id: string;
  status: string;
  amountCents: number;
  destination: PayoutMethod;
  connectAccountId?: string;
  usdcWallet?: string;
  dryRun: boolean;
  transferId?: string;
  /** Base USDC transfer hash when destination=usdc and send succeeded. */
  txHash?: string;
};

/** Effect service for Stripe Connect onboarding + creator payouts. */
export class PayoutService extends Context.Tag("clawql/PayoutService")<
  PayoutService,
  {
    readonly createConnectAccount: (input: {
      email: string;
      country?: string;
      tenantId?: string;
      creatorId?: string;
      correlationId?: string;
    }) => Effect.Effect<ConnectAccountResult, PayoutError | StripeNotConfigured | StripeApiError>;
    readonly createOnboardingLink: (input: {
      accountId: string;
      returnUrl?: string;
      refreshUrl?: string;
      correlationId?: string;
    }) => Effect.Effect<
      ConnectOnboardingLinkResult,
      PayoutError | StripeNotConfigured | StripeApiError
    >;
    readonly createPayout: (input: {
      amountUsd: number;
      destination?: PayoutMethod;
      connectAccountId?: string;
      usdcWallet?: string;
      creatorId?: string;
      tenantId?: string;
      description?: string;
      correlationId?: string;
    }) => Effect.Effect<PayoutResult, PayoutError | StripeNotConfigured | StripeApiError>;
    readonly setPreference: (input: {
      creatorId: string;
      method: PayoutMethod;
      connectAccountId?: string;
      usdcWallet?: string;
      email?: string;
    }) => Effect.Effect<CreatorPayoutPreference, PayoutError>;
    readonly getPreference: (
      creatorId: string
    ) => Effect.Effect<CreatorPayoutPreference | undefined, PayoutError>;
  }
>() {}

export function payoutLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PayoutService, never, PaymentAuditService | StripeClientService> {
  return Layer.effect(
    PayoutService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const stripeClient = yield* StripeClientService;

      const createConnectAccount = (input: {
        email: string;
        country?: string;
        tenantId?: string;
        creatorId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isPayoutsEnabled(env)) {
            return yield* Effect.fail(
              new PayoutError({
                reason: "Payouts disabled — set CLAWQL_PAYOUTS_ENABLED=1",
              })
            );
          }
          const email = input.email.trim();
          if (!email) {
            return yield* Effect.fail(new PayoutError({ reason: "email required" }));
          }
          const tenantId = input.tenantId?.trim() || "default";
          const country = (input.country?.trim() || "US").toUpperCase();

          if (isPayoutsDryRun(env)) {
            const id = `acct_dry_${Date.now().toString(36)}`;
            yield* audit
              .appendEntry(
                buildConnectAccountCreatedEntry({
                  tenantId,
                  accountId: id,
                  email,
                  dryRun: true,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            if (input.creatorId?.trim()) {
              yield* Effect.tryPromise({
                try: () =>
                  setCreatorPayoutPreference(
                    {
                      creatorId: input.creatorId!,
                      method: "bank",
                      connectAccountId: id,
                      email,
                    },
                    env
                  ),
                catch: (cause) =>
                  new PayoutError({
                    reason: cause instanceof Error ? cause.message : "preference write failed",
                    cause,
                  }),
              });
            }
            return { id, email, type: "express", dryRun: true } satisfies ConnectAccountResult;
          }

          const stripe = yield* stripeClient.getClient();
          const account = yield* stripeTryPromise("accounts.create", (): Promise<Stripe.Account> =>
            stripe.accounts.create({
              type: "express",
              country,
              email,
              capabilities: {
                transfers: { requested: true },
              },
              metadata: {
                clawql_tenant: tenantId,
                ...(input.creatorId?.trim() ? { clawql_creator: input.creatorId.trim() } : {}),
              },
            })
          );
          yield* audit
            .appendEntry(
              buildConnectAccountCreatedEntry({
                tenantId,
                accountId: account.id,
                email,
                dryRun: false,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          if (input.creatorId?.trim()) {
            yield* Effect.tryPromise({
              try: () =>
                setCreatorPayoutPreference(
                  {
                    creatorId: input.creatorId!,
                    method: "bank",
                    connectAccountId: account.id,
                    email,
                  },
                  env
                ),
              catch: (cause) =>
                new PayoutError({
                  reason: cause instanceof Error ? cause.message : "preference write failed",
                  cause,
                }),
            });
          }
          return {
            id: account.id,
            email: account.email ?? email,
            type: account.type ?? "express",
            dryRun: false,
          } satisfies ConnectAccountResult;
        });

      const createOnboardingLink = (input: {
        accountId: string;
        returnUrl?: string;
        refreshUrl?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isPayoutsEnabled(env)) {
            return yield* Effect.fail(
              new PayoutError({ reason: "Payouts disabled — set CLAWQL_PAYOUTS_ENABLED=1" })
            );
          }
          const accountId = input.accountId.trim();
          if (!accountId) {
            return yield* Effect.fail(new PayoutError({ reason: "accountId required" }));
          }
          if (isPayoutsDryRun(env) || accountId.startsWith("acct_dry_")) {
            return {
              url: `https://connect.stripe.com/setup/dry/${accountId}`,
              accountId,
              dryRun: true,
            } satisfies ConnectOnboardingLinkResult;
          }
          const stripe = yield* stripeClient.getClient();
          const link = yield* stripeTryPromise(
            "accountLinks.create",
            (): Promise<Stripe.AccountLink> =>
              stripe.accountLinks.create({
                account: accountId,
                refresh_url: input.refreshUrl?.trim() || payoutsDefaultRefreshUrl(env),
                return_url: input.returnUrl?.trim() || payoutsDefaultReturnUrl(env),
                type: "account_onboarding",
              })
          );
          return {
            url: link.url,
            accountId,
            dryRun: false,
          } satisfies ConnectOnboardingLinkResult;
        });

      const createPayout = (input: {
        amountUsd: number;
        destination?: PayoutMethod;
        connectAccountId?: string;
        usdcWallet?: string;
        creatorId?: string;
        tenantId?: string;
        description?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isPayoutsEnabled(env)) {
            return yield* Effect.fail(
              new PayoutError({ reason: "Payouts disabled — set CLAWQL_PAYOUTS_ENABLED=1" })
            );
          }
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new PayoutError({ reason: "amountUsd must be > 0" }));
          }
          const tenantId = input.tenantId?.trim() || "default";
          const amountCents = Math.round(input.amountUsd * 100);

          let destination = input.destination;
          let connectAccountId = input.connectAccountId?.trim();
          let usdcWallet = input.usdcWallet?.trim();

          if (input.creatorId?.trim()) {
            const pref = yield* Effect.tryPromise({
              try: () => getCreatorPayoutPreference(input.creatorId!, env),
              catch: (cause) =>
                new PayoutError({
                  reason: cause instanceof Error ? cause.message : "preference load failed",
                  cause,
                }),
            });
            if (pref) {
              destination = destination ?? pref.method;
              connectAccountId = connectAccountId || pref.connectAccountId;
              usdcWallet = usdcWallet || pref.usdcWallet;
            }
          }
          destination = destination ?? "bank";

          if (destination === "bank" && !connectAccountId) {
            return yield* Effect.fail(
              new PayoutError({
                reason: "connectAccountId required for bank payouts (or set creator preference)",
              })
            );
          }
          if (destination === "usdc" && !usdcWallet) {
            return yield* Effect.fail(
              new PayoutError({
                reason: "usdcWallet required for USDC payouts (or set creator preference)",
              })
            );
          }

          // Bank dry-run only — USDC has its own dry-run via CLAWQL_PAYOUTS_USDC_* / missing key.
          if (
            destination === "bank" &&
            (isPayoutsDryRun(env) || connectAccountId?.startsWith("acct_dry_"))
          ) {
            const id = `po_dry_${Date.now().toString(36)}`;
            yield* audit
              .appendEntry(
                buildPayoutInitiatedEntry({
                  tenantId,
                  payoutId: id,
                  amountUsd: amountCents / 100,
                  destination,
                  dryRun: true,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* audit
              .appendEntry(
                buildPayoutPaidEntry({
                  tenantId,
                  payoutId: id,
                  amountUsd: amountCents / 100,
                  destination,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              status: "paid",
              amountCents,
              destination,
              connectAccountId,
              usdcWallet,
              dryRun: true,
            } satisfies PayoutResult;
          }

          if (destination === "usdc") {
            const usdcEnv = isPayoutsDryRun(env)
              ? ({ ...env, CLAWQL_PAYOUTS_USDC_DRY_RUN: "1" } as NodeJS.ProcessEnv)
              : env;
            const sent = yield* Effect.tryPromise({
              try: () =>
                sendUsdcPayout(
                  {
                    to: usdcWallet!,
                    amountUsd: amountCents / 100,
                    correlationId: input.correlationId,
                  },
                  usdcEnv
                ),
              catch: (cause) =>
                cause instanceof UsdcSendError
                  ? new PayoutError({ reason: cause.reason, cause })
                  : new PayoutError({
                      reason: cause instanceof Error ? cause.message : "USDC send failed",
                      cause,
                    }),
            });
            const id = sent.txHash;
            yield* audit
              .appendEntry(
                buildPayoutInitiatedEntry({
                  tenantId,
                  payoutId: id,
                  amountUsd: amountCents / 100,
                  destination: "usdc",
                  dryRun: sent.dryRun,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* audit
              .appendEntry(
                buildPayoutPaidEntry({
                  tenantId,
                  payoutId: id,
                  amountUsd: amountCents / 100,
                  destination: "usdc",
                  correlationId: input.correlationId ?? id,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id,
              status: sent.dryRun ? "paid" : "submitted",
              amountCents,
              destination: "usdc",
              usdcWallet,
              dryRun: sent.dryRun,
              txHash: sent.txHash,
            } satisfies PayoutResult;
          }

          const stripe = yield* stripeClient.getClient();
          try {
            const transfer = yield* stripeTryPromise(
              "transfers.create",
              (): Promise<Stripe.Transfer> =>
                stripe.transfers.create({
                  amount: amountCents,
                  currency: "usd",
                  destination: connectAccountId!,
                  description: input.description?.trim() || "ClawQL creator payout",
                  metadata: {
                    clawql_tenant: tenantId,
                    clawql_payout: "1",
                    ...(input.creatorId?.trim() ? { clawql_creator: input.creatorId.trim() } : {}),
                  },
                })
            );
            // Live bank: INITIATED here; PAYOUT_PAID settles via Connect webhooks.
            yield* audit
              .appendEntry(
                buildPayoutInitiatedEntry({
                  tenantId,
                  payoutId: transfer.id,
                  amountUsd: amountCents / 100,
                  destination: "bank",
                  dryRun: false,
                  correlationId: input.correlationId ?? transfer.id,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return {
              id: transfer.id,
              status: transfer.reversed ? "reversed" : "pending",
              amountCents,
              destination: "bank",
              connectAccountId,
              dryRun: false,
              transferId: transfer.id,
            } satisfies PayoutResult;
          } catch (cause) {
            yield* audit
              .appendEntry(
                buildPayoutFailedEntry({
                  tenantId,
                  reason: cause instanceof Error ? cause.message : String(cause),
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            return yield* Effect.fail(
              cause instanceof PayoutError ||
                cause instanceof StripeApiError ||
                cause instanceof StripeNotConfigured
                ? cause
                : new PayoutError({
                    reason: cause instanceof Error ? cause.message : "payout failed",
                    cause,
                  })
            );
          }
        });

      const setPreference = (input: {
        creatorId: string;
        method: PayoutMethod;
        connectAccountId?: string;
        usdcWallet?: string;
        email?: string;
      }) =>
        Effect.tryPromise({
          try: () => setCreatorPayoutPreference(input, env),
          catch: (cause) =>
            new PayoutError({
              reason: cause instanceof Error ? cause.message : "preference write failed",
              cause,
            }),
        });

      const getPreference = (creatorId: string) =>
        Effect.tryPromise({
          try: () => getCreatorPayoutPreference(creatorId, env),
          catch: (cause) =>
            new PayoutError({
              reason: cause instanceof Error ? cause.message : "preference load failed",
              cause,
            }),
        });

      return PayoutService.of({
        createConnectAccount,
        createOnboardingLink,
        createPayout,
        setPreference,
        getPreference,
      });
    })
  );
}
