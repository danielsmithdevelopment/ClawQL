/**
 * Sync credit DeductionService (counter + ledger), then emit DeductionEventBus.
 *
 * Order of truth for agentic workloads:
 * 1. Atomic hold/debit on the ledger counter (authorize)
 * 2. Run work
 * 3. Capture or release
 * 4. Publish outbox/NATS after the mutation (never authorize via the bus)
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildCreditCapturedEntry,
  buildCreditDebitedEntry,
  buildCreditHeldEntry,
  buildCreditReleasedEntry,
} from "../audit/events.js";
import { isCreditsEnabled } from "./config.js";
import {
  CreditsLedgerService,
  type CreditAccount,
  type CreditHold,
  type CreditLedgerEntry,
  type LedgerError,
} from "./ledger.js";
import { DeductionEventBus, buildDeductionEvent } from "./deduction-event-bus.js";

export class DeductionError extends Data.TaggedError("DeductionError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type DeductionHoldResult = {
  readonly hold: CreditHold;
  readonly entry: CreditLedgerEntry;
  readonly alreadyExisted: boolean;
  readonly spendableAfterCents: number;
};

export type DeductionCaptureResult = {
  readonly hold: CreditHold;
  readonly entry: CreditLedgerEntry;
  readonly refundedCents: number;
  readonly alreadyCaptured: boolean;
};

export type DeductionReleaseResult = {
  readonly hold: CreditHold;
  readonly entry: CreditLedgerEntry;
  readonly alreadyReleased: boolean;
};

/** Sync counter decisions + durable ledger; events are post-commit only. */
export class DeductionService extends Context.Tag("clawql/DeductionService")<
  DeductionService,
  {
    readonly getSpendableBalance: (
      tenantId: string
    ) => Effect.Effect<CreditAccount, DeductionError>;
    readonly hold: (input: {
      tenantId: string;
      amountCents: number;
      idempotencyKey: string;
      resource?: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<DeductionHoldResult, DeductionError>;
    readonly capture: (input: {
      tenantId: string;
      idempotencyKey: string;
      actualAmountCents?: number;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<DeductionCaptureResult, DeductionError>;
    readonly release: (input: {
      tenantId: string;
      idempotencyKey: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<DeductionReleaseResult, DeductionError>;
    /** Immediate debit (hold+capture equivalent) for simple paths. */
    readonly debit: (input: {
      tenantId: string;
      amountCents: number;
      idempotencyKey: string;
      resource?: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<CreditLedgerEntry, DeductionError>;
  }
>() {}

function mapLedgerError(error: LedgerError): DeductionError {
  return new DeductionError({ reason: error.reason, cause: error.cause });
}

export function deductionLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  DeductionService,
  never,
  PaymentAuditService | DeductionEventBus | CreditsLedgerService
> {
  return Layer.effect(
    DeductionService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const bus = yield* DeductionEventBus;
      const ledger = yield* CreditsLedgerService;

      const getSpendableBalance = (tenantId: string) =>
        Effect.gen(function* () {
          if (!(yield* isCreditsEnabled(env))) {
            return yield* Effect.fail(
              new DeductionError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          return yield* ledger.getAccount(tenantId).pipe(Effect.mapError(mapLedgerError));
        });

      const hold = (input: {
        tenantId: string;
        amountCents: number;
        idempotencyKey: string;
        resource?: string;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          if (!(yield* isCreditsEnabled(env))) {
            return yield* Effect.fail(
              new DeductionError({
                reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1",
              })
            );
          }
          const result = yield* ledger.hold(input).pipe(Effect.mapError(mapLedgerError));
          if (!result.alreadyExisted) {
            yield* audit
              .appendEntry(
                buildCreditHeldEntry({
                  tenantId: input.tenantId,
                  amountUsd: result.hold.amountCents / 100,
                  balanceUsd: result.spendableAfterCents / 100,
                  holdId: result.hold.id,
                  resource: input.resource,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* bus.publish(
              yield* buildDeductionEvent(
                "credits.held",
                {
                  tenantId: input.tenantId,
                  idempotencyKey: input.idempotencyKey,
                  amountCents: result.hold.amountCents,
                  balanceAfterCents: result.spendableAfterCents,
                  correlationId: input.correlationId,
                  resource: input.resource,
                  holdId: result.hold.id,
                },
                env
              )
            );
          }
          return result;
        });

      const capture = (input: {
        tenantId: string;
        idempotencyKey: string;
        actualAmountCents?: number;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          const result = yield* ledger.capture(input).pipe(Effect.mapError(mapLedgerError));
          if (!result.alreadyCaptured) {
            yield* audit
              .appendEntry(
                buildCreditCapturedEntry({
                  tenantId: input.tenantId,
                  amountUsd: result.hold.amountCents / 100,
                  refundedUsd: result.refundedCents / 100,
                  balanceUsd: result.entry.balanceAfterCents / 100,
                  holdId: result.hold.id,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* bus.publish(
              yield* buildDeductionEvent(
                "credits.captured",
                {
                  tenantId: input.tenantId,
                  idempotencyKey: input.idempotencyKey,
                  amountCents: result.hold.amountCents,
                  balanceAfterCents: result.entry.balanceAfterCents,
                  correlationId: input.correlationId,
                  holdId: result.hold.id,
                  payload: { refunded_cents: result.refundedCents },
                },
                env
              )
            );
          }
          return result;
        });

      const release = (input: {
        tenantId: string;
        idempotencyKey: string;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          const result = yield* ledger.release(input).pipe(Effect.mapError(mapLedgerError));
          if (!result.alreadyReleased) {
            yield* audit
              .appendEntry(
                buildCreditReleasedEntry({
                  tenantId: input.tenantId,
                  amountUsd: result.hold.amountCents / 100,
                  balanceUsd: result.entry.balanceAfterCents / 100,
                  holdId: result.hold.id,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
            yield* bus.publish(
              yield* buildDeductionEvent(
                "credits.released",
                {
                  tenantId: input.tenantId,
                  idempotencyKey: input.idempotencyKey,
                  amountCents: result.hold.amountCents,
                  balanceAfterCents: result.entry.balanceAfterCents,
                  correlationId: input.correlationId,
                  holdId: result.hold.id,
                },
                env
              )
            );
          }
          return result;
        });

      const debit = (input: {
        tenantId: string;
        amountCents: number;
        idempotencyKey: string;
        resource?: string;
        correlationId?: string;
        note?: string;
      }) =>
        Effect.gen(function* () {
          if (!(yield* isCreditsEnabled(env))) {
            return yield* Effect.fail(
              new DeductionError({
                reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1",
              })
            );
          }
          const held = yield* hold(input);
          if (held.alreadyExisted && held.hold.status === "captured") {
            return held.entry;
          }
          const captured = yield* capture({
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey,
            actualAmountCents: input.amountCents,
            correlationId: input.correlationId,
            note: input.note,
          });
          yield* bus.publish(
            yield* buildDeductionEvent(
              "credits.debited",
              {
                tenantId: input.tenantId,
                idempotencyKey: input.idempotencyKey,
                amountCents: input.amountCents,
                balanceAfterCents: captured.entry.balanceAfterCents,
                correlationId: input.correlationId,
                resource: input.resource,
                holdId: held.hold.id,
              },
              env
            )
          );
          yield* audit
            .appendEntry(
              buildCreditDebitedEntry({
                tenantId: input.tenantId,
                amountUsd: input.amountCents / 100,
                balanceUsd: captured.entry.balanceAfterCents / 100,
                resource: input.resource,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return captured.entry;
        });

      return DeductionService.of({
        getSpendableBalance,
        hold,
        capture,
        release,
        debit,
      });
    })
  );
}
