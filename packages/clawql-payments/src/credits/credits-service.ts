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
import {
  assertPendingCode,
  buildApprovalUrl,
  buildCancelUrl,
  buildConfirmUrl,
  savePendingAction,
  stagePendingAction,
  type PendingActionRecord,
} from "../compensation/pending-actions.js";
import {
  isCreditsEnabled,
  isCreditsTransferDirectAllowed,
  isCreditsTransferTotpRequired,
} from "./config.js";
import {
  appendCreditEntry,
  getCreditAccount,
  settleTopupByPaymentIntent,
  transferCredits,
  type CreditAccount,
  type CreditLedgerEntry,
  type CreditTransferResult,
} from "./ledger.js";
import { requireStepUpTotp } from "./step-up.js";
import { markMoneyRequestPaid } from "./requests.js";

export const CREDITS_TRANSFER_STAGE_TOOL = "payments_credits_transfer_stage";
export const CREDITS_TRANSFER_CONFIRM_TOOL = "payments_credits_transfer_confirm";

export class CreditsError extends Data.TaggedError("CreditsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type StagedCreditTransfer = {
  actionId: string;
  confirmationCode: string;
  tool: string;
  kind: "credits_transfer";
  fromTenantId: string;
  toTenantId: string;
  amountUsd: number;
  approvalUrl: string;
  confirmUrl: string;
  cancelUrl: string;
  expiresAt: string;
  classification: "financial";
  totpRequired: boolean;
};

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
    /**
     * Execute P2P transfer immediately. Prefer stageTransfer + confirmTransfer
     * unless CLAWQL_CREDITS_TRANSFER_DIRECT=1.
     */
    readonly transfer: (input: {
      fromTenantId: string;
      toTenantId: string;
      amountCents: number;
      idempotencyKey?: string;
      correlationId?: string;
      note?: string;
    }) => Effect.Effect<CreditTransferResult, CreditsError>;
    /** Stage high-impact transfer (inert until confirm). */
    readonly stageTransfer: (input: {
      fromTenantId: string;
      toTenantId: string;
      amountCents: number;
      idempotencyKey?: string;
      correlationId?: string;
      note?: string;
      /** When set, confirm marks the money request paid. */
      requestId?: string;
    }) => Effect.Effect<StagedCreditTransfer, CreditsError>;
    /** Confirm staged transfer; optional TOTP when CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1. */
    readonly confirmTransfer: (input: {
      actionId: string;
      code: string;
      totp?: string;
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

      const stageTransfer = (input: {
        fromTenantId: string;
        toTenantId: string;
        amountCents: number;
        idempotencyKey?: string;
        correlationId?: string;
        note?: string;
        requestId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isCreditsEnabled(env)) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          const fromTenantId = input.fromTenantId.trim();
          const toTenantId = input.toTenantId.trim();
          if (!fromTenantId || !toTenantId) {
            return yield* Effect.fail(
              new CreditsError({ reason: "fromTenantId and toTenantId are required" })
            );
          }
          if (fromTenantId === toTenantId) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Cannot transfer credits to the same tenant" })
            );
          }
          if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
            return yield* Effect.fail(new CreditsError({ reason: "amountCents must be > 0" }));
          }
          const record = yield* Effect.tryPromise({
            try: () =>
              stagePendingAction(
                {
                  tool: CREDITS_TRANSFER_STAGE_TOOL,
                  kind: "credits_transfer",
                  classification: "financial",
                  agentId: fromTenantId,
                  tenantId: fromTenantId,
                  correlationId: input.correlationId,
                  args: {
                    fromTenantId,
                    toTenantId,
                    amountCents: Math.round(input.amountCents),
                    idempotencyKey: input.idempotencyKey,
                    note: input.note,
                    requestId: input.requestId?.trim() || undefined,
                  },
                },
                env
              ),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Failed to stage transfer",
                cause,
              }),
          });
          return {
            actionId: record.actionId,
            confirmationCode: record.confirmationCode,
            tool: CREDITS_TRANSFER_STAGE_TOOL,
            kind: "credits_transfer" as const,
            fromTenantId,
            toTenantId,
            amountUsd: Math.round(input.amountCents) / 100,
            approvalUrl: buildApprovalUrl(
              CREDITS_TRANSFER_CONFIRM_TOOL,
              record.actionId,
              record.confirmationCode,
              env
            ),
            confirmUrl: buildConfirmUrl(
              CREDITS_TRANSFER_CONFIRM_TOOL,
              record.actionId,
              record.confirmationCode,
              env
            ),
            cancelUrl: buildCancelUrl(
              CREDITS_TRANSFER_CONFIRM_TOOL,
              record.actionId,
              record.confirmationCode,
              env
            ),
            expiresAt: record.expiresAt,
            classification: "financial" as const,
            totpRequired: isCreditsTransferTotpRequired(env),
          } satisfies StagedCreditTransfer;
        });

      const confirmTransfer = (input: { actionId: string; code: string; totp?: string }) =>
        Effect.gen(function* () {
          if (!isCreditsEnabled(env)) {
            return yield* Effect.fail(
              new CreditsError({ reason: "Credits disabled — set CLAWQL_CREDITS_ENABLED=1" })
            );
          }
          const record = yield* Effect.tryPromise({
            try: () => assertPendingCode(input.actionId, input.code, env),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Invalid pending action",
                cause,
              }),
          });
          if (record.kind !== "credits_transfer") {
            return yield* Effect.fail(
              new CreditsError({
                reason: `action ${record.actionId} is kind=${record.kind}; expected credits_transfer`,
              })
            );
          }
          if (record.status === "executed") {
            const prior = record.result as CreditTransferResult | undefined;
            if (prior?.transferId) return prior;
            return yield* Effect.fail(
              new CreditsError({ reason: "Transfer already executed without stored result" })
            );
          }
          if (record.status !== "pending") {
            return yield* Effect.fail(
              new CreditsError({ reason: `Transfer action is ${record.status}` })
            );
          }

          const fromTenantId = String(record.args.fromTenantId ?? record.agentId);
          if (isCreditsTransferTotpRequired(env)) {
            yield* Effect.tryPromise({
              try: () => requireStepUpTotp(fromTenantId, input.totp, env),
              catch: (cause) =>
                new CreditsError({
                  reason: cause instanceof Error ? cause.message : "TOTP step-up failed",
                  cause,
                }),
            });
          }

          const amountCents = Number(record.args.amountCents);
          const result = yield* transfer({
            fromTenantId,
            toTenantId: String(record.args.toTenantId ?? ""),
            amountCents,
            idempotencyKey:
              typeof record.args.idempotencyKey === "string"
                ? record.args.idempotencyKey
                : undefined,
            correlationId: record.correlationId,
            note: typeof record.args.note === "string" ? record.args.note : undefined,
          });

          const updated: PendingActionRecord = {
            ...record,
            status: "executed",
            executedAt: new Date().toISOString(),
            result: { ...result },
          };
          yield* Effect.tryPromise({
            try: () => savePendingAction(updated, env),
            catch: (cause) =>
              new CreditsError({
                reason: cause instanceof Error ? cause.message : "Failed to save pending action",
                cause,
              }),
          });

          const requestId =
            typeof record.args.requestId === "string" ? record.args.requestId.trim() : "";
          if (requestId) {
            yield* Effect.promise(async () => {
              try {
                await markMoneyRequestPaid(
                  { requestId, transferId: result.transferId },
                  env
                );
              } catch {
                /* best-effort — transfer already succeeded */
              }
            });
          }

          return result;
        });

      return CreditsService.of({
        getBalance,
        debit,
        settleTopup,
        markTopupFailed,
        transfer,
        stageTransfer,
        confirmTransfer,
      });
    })
  );
}

/** @internal — used by CLI when deciding stage vs direct. */
export function creditsTransferShouldStage(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isCreditsTransferDirectAllowed(env);
}
