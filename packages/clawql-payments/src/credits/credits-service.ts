import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildCreditDebitedEntry,
  buildCreditTransferReceivedEntry,
  buildCreditTransferSentEntry,
  buildCreditTopupFailedEntry,
  buildCreditTopupSettledEntry,
} from "../audit/events.js";
import { isCreditsEnabled } from "./config.js";
import {
  appendCreditEntry,
  getCreditAccount,
  settleTopupByPaymentIntent,
  transferCredits,
  type CreditAccount,
  type CreditLedgerEntry,
  type CreditTransferResult,
} from "./ledger.js";

export class CreditsError extends Data.TaggedError("CreditsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Prepaid USD credit balances for tenants (local ledger + WORM). */
export class CreditsService extends Context.Tag("clawql/CreditsService")<
  CreditsService,
  {
    readonly getBalance: (tenantId: string) => Effect.Effect<CreditAccount, CreditsError>;
    readonly debit: (input: {
      tenantId: string;
      amountCents: number;
      resource?: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<CreditLedgerEntry, CreditsError>;
    readonly settleTopup: (input: {
      tenantId: string;
      paymentIntentId: string;
      amountCents: number;
      correlationId?: string;
    }) => Effect.Effect<{ entry: CreditLedgerEntry; alreadySettled: boolean }, CreditsError>;
    readonly markTopupFailed: (input: {
      tenantId: string;
      paymentIntentId: string;
      amountCents: number;
      reason: string;
      correlationId?: string;
    }) => Effect.Effect<CreditLedgerEntry, CreditsError>;
    /** P2P prepaid credit transfer between ClawQL tenants. */
    readonly transfer: (input: {
      fromTenantId: string;
      toTenantId: string;
      amountCents: number;
      idempotencyKey?: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<CreditTransferResult, CreditsError>;
  }
>() {}

export function creditsLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsService, never, PaymentAuditService> {
  return Layer.effect(
    CreditsService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const getBalance = (tenantId: string) =>
        Effect.tryPromise({
          try: async () => {
            if (!isCreditsEnabled(env)) {
              throw new CreditsError({
                reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1",
              });
            }
            return getCreditAccount(tenantId, env);
          },
          catch: (cause) =>
            cause instanceof CreditsError
              ? cause
              : new CreditsError({ reason: "Failed to load credit balance", cause }),
        });

      const debit = (input: {
        tenantId: string;
        amountCents: number;
        resource?: string;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          if (!isCreditsEnabled(env)) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
            return yield* Effect.fail(new CreditsError({ reason: "amountCents must be > 0" }));
          }
          const entry = yield* Effect.tryPromise({
            try: () =>
              appendCreditEntry(
                {
                  tenantId: input.tenantId,
                  kind: "debit",
                  deltaCents: -Math.round(input.amountCents),
                  correlationId: input.correlationId,
                  note: input.note ?? input.resource,
                },
                env
              ),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Credit debit failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCreditDebitedEntry({
                tenantId: input.tenantId,
                amountUsd: Math.round(input.amountCents) / 100,
                balanceUsd: entry.balanceAfterCents / 100,
                resource: input.resource,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return entry;
        });

      const settleTopup = (input: {
        tenantId: string;
        paymentIntentId: string;
        amountCents: number;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isCreditsEnabled(env)) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          const result = yield* Effect.tryPromise({
            try: () => settleTopupByPaymentIntent(input, env),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Top-up settle failed",
                cause,
              }),
          });
          if (!result.alreadySettled) {
            yield* audit
              .appendEntry(
                buildCreditTopupSettledEntry({
                  tenantId: input.tenantId,
                  amountUsd: input.amountCents / 100,
                  balanceUsd: result.entry.balanceAfterCents / 100,
                  paymentIntentId: input.paymentIntentId,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }
          return result;
        });

      const markTopupFailed = (input: {
        tenantId: string;
        paymentIntentId: string;
        amountCents: number;
        reason: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          const entry = yield* Effect.tryPromise({
            try: () =>
              appendCreditEntry(
                {
                  tenantId: input.tenantId,
                  kind: "topup_failed",
                  deltaCents: 0,
                  paymentIntentId: input.paymentIntentId,
                  correlationId: input.correlationId,
                  note: input.reason,
                  id: `fail_${input.paymentIntentId}`,
                },
                env
              ),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Top-up fail mark failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCreditTopupFailedEntry({
                tenantId: input.tenantId,
                amountUsd: input.amountCents / 100,
                paymentIntentId: input.paymentIntentId,
                reason: input.reason,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return entry;
        });

      const transfer = (input: {
        fromTenantId: string;
        toTenantId: string;
        amountCents: number;
        idempotencyKey?: string;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          if (!isCreditsEnabled(env)) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          const result = yield* Effect.tryPromise({
            try: () => transferCredits(input, env),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Credit transfer failed",
                cause,
              }),
          });
          if (!result.alreadyExisted) {
            const amountUsd = result.amountCents / 100;
            yield* audit
              .appendEntry(
                buildCreditTransferSentEntry({
                  tenantId: result.fromTenantId,
                  toTenantId: result.toTenantId,
                  amountUsd,
                  balanceUsd: result.fromEntry.balanceAfterCents / 100,
                  transferId: result.transferId,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* audit
              .appendEntry(
                buildCreditTransferReceivedEntry({
                  tenantId: result.toTenantId,
                  fromTenantId: result.fromTenantId,
                  amountUsd,
                  balanceUsd: result.toEntry.balanceAfterCents / 100,
                  transferId: result.transferId,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }
          return result;
        });

      return CreditsService.of({
        getBalance,
        debit,
        settleTopup,
        markTopupFailed,
        transfer,
      });
    })
  );
}
