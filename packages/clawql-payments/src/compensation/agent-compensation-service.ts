/**
 * Agent compensation: credits/funds ledger + DAOS-aligned two-phase commit + cash-out.
 *
 * Designed for future SGDOP recruitment: Coordinator stages a deposit when a
 * diverse agent is recruited to cover a blind spot; agent/operator confirms;
 * agent later cash-outs via PayoutService (bank / USDC).
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { PayoutService, type PayoutResult } from "../payouts/payout-service.js";
import type { PayoutMethod } from "../payouts/preferences.js";
import {
  buildCompensationCancelledEntry,
  buildCompensationCashoutCompletedEntry,
  buildCompensationCashoutFailedEntry,
  buildCompensationCashoutStagedEntry,
  buildCompensationDepositConfirmedEntry,
  buildCompensationDepositFailedEntry,
  buildCompensationDepositStagedEntry,
} from "../audit/events.js";
import {
  compensationCreditUsdRate,
  isCompensationDirectAllowed,
  isCompensationEnabled,
} from "./config.js";
import {
  creditAgentAccount,
  debitAgentAccount,
  ensureAgentAccount,
  getAgentAccount,
  setAgentAccountPreference,
  type AgentAccount,
} from "./accounts.js";
import { COMPENSATION_CASHOUT_STAGE_TOOL, COMPENSATION_DEPOSIT_STAGE_TOOL } from "./high-impact.js";
import {
  assertPendingCode,
  buildApprovalUrl,
  buildCancelUrl,
  buildConfirmUrl,
  findRecruitDepositByKey,
  listPendingActions,
  savePendingAction,
  stagePendingAction,
  type PendingActionRecord,
} from "./pending-actions.js";
import type { StageRecruitCompensationMeta } from "./staging-types.js";

export class CompensationError extends Data.TaggedError("CompensationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type CompensationReason = "sgdop_recruit" | "diversity_dividend" | "task_bounty" | "manual";

export type StagedCompensation = {
  actionId: string;
  confirmationCode: string;
  tool: string;
  kind: PendingActionRecord["kind"];
  agentId: string;
  amountUsd: number;
  approvalUrl: string;
  cancelUrl: string;
  expiresAt: string;
  classification: "financial";
  /** True when returned from an existing pending row for the same recruit key. */
  idempotentReplay?: boolean;
};

export type ApproveView = {
  actionId: string;
  status: PendingActionRecord["status"];
  tool: string;
  kind: PendingActionRecord["kind"];
  agentId: string;
  args: Record<string, unknown>;
  /** Next HATEOAS step — null when already terminal. */
  approvalUrl: string | null;
  confirmUrl: string | null;
  cancelUrl: string | null;
  expiresAt: string;
};

export type DepositResult = {
  agentId: string;
  kind: "deposit_credits" | "deposit_funds";
  amountUsd: number;
  balance: AgentAccount;
  actionId?: string;
  dryRun?: boolean;
};

export type CashoutResult = {
  agentId: string;
  amountUsd: number;
  source: "credits" | "funds";
  payout: PayoutResult;
  balance: AgentAccount;
  actionId?: string;
};

/** Effect service for agent credits, staged deposits, and cash-out. */
export class AgentCompensationService extends Context.Tag("clawql/AgentCompensationService")<
  AgentCompensationService,
  {
    readonly getAccount: (agentId: string) => Effect.Effect<AgentAccount, CompensationError>;
    readonly setPreference: (input: {
      agentId: string;
      cashoutMethod?: PayoutMethod;
      connectAccountId?: string;
      usdcWallet?: string;
      email?: string;
      tenantId?: string;
    }) => Effect.Effect<AgentAccount, CompensationError>;
    /** Stage a high-impact deposit (inert until confirm). Idempotent on recruitmentId+agentId+reason. */
    readonly stageDeposit: (input: {
      agentId: string;
      amountUsd: number;
      asset: "credits" | "funds";
      reason?: CompensationReason;
      tenantId?: string;
      correlationId?: string;
      /** SGDOP blind-spot / recruitment id for traceability + idempotency. */
      recruitmentId?: string;
      /** Optional Command Deck / escalation metadata (not secrets). */
      meta?: StageRecruitCompensationMeta;
    }) => Effect.Effect<StagedCompensation, CompensationError>;
    /** Stage cash-out (debits + PayoutService only on confirm). */
    readonly stageCashout: (input: {
      agentId: string;
      amountUsd: number;
      source?: "credits" | "funds";
      destination?: PayoutMethod;
      connectAccountId?: string;
      usdcWallet?: string;
      tenantId?: string;
      correlationId?: string;
    }) => Effect.Effect<StagedCompensation, CompensationError>;
    /** GET-safe approve view — never executes. */
    readonly approve: (input: {
      actionId: string;
      code: string;
    }) => Effect.Effect<ApproveView, CompensationError>;
    /** Sole irreversible execute step (POST confirm). */
    readonly confirm: (input: {
      actionId: string;
      code: string;
    }) => Effect.Effect<DepositResult | CashoutResult, CompensationError>;
    readonly cancel: (input: {
      actionId: string;
      code: string;
    }) => Effect.Effect<{ actionId: string; status: "cancelled" }, CompensationError>;
    readonly listPending: (input?: {
      agentId?: string;
      recruitmentId?: string;
    }) => Effect.Effect<PendingActionRecord[], CompensationError>;
    /**
     * Trusted direct deposit (no 2PC). Requires CLAWQL_COMPENSATION_DIRECT=1.
     */
    readonly depositDirect: (input: {
      agentId: string;
      amountUsd: number;
      asset: "credits" | "funds";
      reason?: CompensationReason;
      tenantId?: string;
      correlationId?: string;
      recruitmentId?: string;
    }) => Effect.Effect<DepositResult, CompensationError>;
  }
>() {}

export function agentCompensationLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AgentCompensationService, never, PaymentAuditService | PayoutService> {
  return Layer.effect(
    AgentCompensationService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const payouts = yield* PayoutService;

      const ensureEnabled = () => {
        if (!isCompensationEnabled(env)) {
          throw new CompensationError({
            reason: "Compensation disabled — set CLAWQL_COMPENSATION_ENABLED=1",
          });
        }
      };

      const getAccount = (agentId: string) =>
        Effect.tryPromise({
          try: async () => {
            ensureEnabled();
            return ensureAgentAccount(agentId, env);
          },
          catch: (cause) =>
            cause instanceof CompensationError
              ? cause
              : new CompensationError({
                  reason: cause instanceof Error ? cause.message : "getAccount failed",
                  cause,
                }),
        });

      const setPreference = (input: {
        agentId: string;
        cashoutMethod?: PayoutMethod;
        connectAccountId?: string;
        usdcWallet?: string;
        email?: string;
        tenantId?: string;
      }) =>
        Effect.tryPromise({
          try: async () => {
            ensureEnabled();
            return setAgentAccountPreference(input, env);
          },
          catch: (cause) =>
            cause instanceof CompensationError
              ? cause
              : new CompensationError({
                  reason: cause instanceof Error ? cause.message : "setPreference failed",
                  cause,
                }),
        });

      const toStaged = (
        record: PendingActionRecord,
        amountUsd: number,
        opts?: { idempotentReplay?: boolean }
      ): StagedCompensation => ({
        actionId: record.actionId,
        confirmationCode: record.confirmationCode,
        tool: record.tool,
        kind: record.kind,
        agentId: record.agentId,
        amountUsd,
        approvalUrl: buildApprovalUrl(record.tool, record.actionId, record.confirmationCode, env),
        cancelUrl: buildCancelUrl(record.tool, record.actionId, record.confirmationCode, env),
        expiresAt: record.expiresAt,
        classification: "financial" as const,
        idempotentReplay: opts?.idempotentReplay,
      });

      const stageDeposit = (input: {
        agentId: string;
        amountUsd: number;
        asset: "credits" | "funds";
        reason?: CompensationReason;
        tenantId?: string;
        correlationId?: string;
        recruitmentId?: string;
        meta?: StageRecruitCompensationMeta;
      }) =>
        Effect.gen(function* () {
          ensureEnabled();
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new CompensationError({ reason: "amountUsd must be > 0" }));
          }
          if (!input.agentId.trim()) {
            return yield* Effect.fail(new CompensationError({ reason: "agentId required" }));
          }
          const reason = input.reason ?? "manual";
          const recruitmentId = input.recruitmentId?.trim() || undefined;

          // Idempotency: (recruitmentId, agentId, reason) → return existing pending or block double-pay.
          if (recruitmentId) {
            const existing = yield* Effect.tryPromise({
              try: () =>
                findRecruitDepositByKey(
                  {
                    recruitmentId,
                    agentId: input.agentId,
                    reason,
                  },
                  env
                ),
              catch: (cause) =>
                new CompensationError({
                  reason: cause instanceof Error ? cause.message : "idempotency lookup failed",
                  cause,
                }),
            });
            if (existing?.status === "pending") {
              const prevAmount = Number(existing.args.amountUsd);
              const prevAsset = String(existing.args.asset ?? "credits");
              if (Math.abs(prevAmount - input.amountUsd) > 1e-9 || prevAsset !== input.asset) {
                return yield* Effect.fail(
                  new CompensationError({
                    reason: `Idempotent conflict for recruitment ${recruitmentId} / ${input.agentId}: existing pending amount=${prevAmount} asset=${prevAsset}`,
                  })
                );
              }
              return toStaged(existing, input.amountUsd, { idempotentReplay: true });
            }
            if (existing?.status === "executed") {
              return yield* Effect.fail(
                new CompensationError({
                  reason: `Deposit already executed for recruitment ${recruitmentId} / agent ${input.agentId} (${reason})`,
                })
              );
            }
          }

          yield* Effect.tryPromise({
            try: () => ensureAgentAccount(input.agentId, env, input.tenantId),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "ensure account failed",
                cause,
              }),
          });
          const kind = input.asset === "funds" ? "deposit_funds" : "deposit_credits";
          const tool = COMPENSATION_DEPOSIT_STAGE_TOOL;
          const record = yield* Effect.tryPromise({
            try: () =>
              stagePendingAction(
                {
                  tool,
                  kind,
                  classification: "financial",
                  agentId: input.agentId,
                  tenantId: input.tenantId,
                  correlationId: input.correlationId ?? recruitmentId,
                  args: {
                    amountUsd: input.amountUsd,
                    asset: input.asset,
                    reason,
                    recruitmentId,
                    ...(input.meta ? { meta: input.meta } : {}),
                  },
                },
                env
              ),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "stage failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCompensationDepositStagedEntry({
                tenantId: record.tenantId,
                actionId: record.actionId,
                agentId: record.agentId,
                amountUsd: input.amountUsd,
                asset: input.asset,
                reason,
                recruitmentId,
                correlationId: record.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return toStaged(record, input.amountUsd);
        });

      const stageCashout = (input: {
        agentId: string;
        amountUsd: number;
        source?: "credits" | "funds";
        destination?: PayoutMethod;
        connectAccountId?: string;
        usdcWallet?: string;
        tenantId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          ensureEnabled();
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new CompensationError({ reason: "amountUsd must be > 0" }));
          }
          const account = yield* Effect.tryPromise({
            try: () => ensureAgentAccount(input.agentId, env, input.tenantId),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "ensure account failed",
                cause,
              }),
          });
          const source =
            input.source ??
            (account.fundsUsd >= input.amountUsd
              ? "funds"
              : account.creditsUsd >= input.amountUsd
                ? "credits"
                : "credits");
          const available = source === "funds" ? account.fundsUsd : account.creditsUsd;
          if (available + 1e-9 < input.amountUsd) {
            return yield* Effect.fail(
              new CompensationError({
                reason: `Insufficient ${source}: have ${available}, need ${input.amountUsd}`,
              })
            );
          }
          const destination = input.destination ?? account.cashoutMethod ?? "bank";
          const tool = COMPENSATION_CASHOUT_STAGE_TOOL;
          const record = yield* Effect.tryPromise({
            try: () =>
              stagePendingAction(
                {
                  tool,
                  kind: "cashout",
                  classification: "financial",
                  agentId: input.agentId,
                  tenantId: input.tenantId,
                  correlationId: input.correlationId,
                  args: {
                    amountUsd: input.amountUsd,
                    source,
                    destination,
                    connectAccountId: input.connectAccountId ?? account.connectAccountId,
                    usdcWallet: input.usdcWallet ?? account.usdcWallet,
                  },
                },
                env
              ),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "stage cashout failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCompensationCashoutStagedEntry({
                tenantId: record.tenantId,
                actionId: record.actionId,
                agentId: record.agentId,
                amountUsd: input.amountUsd,
                destination,
                source,
                correlationId: record.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return {
            actionId: record.actionId,
            confirmationCode: record.confirmationCode,
            tool,
            kind: "cashout" as const,
            agentId: record.agentId,
            amountUsd: input.amountUsd,
            approvalUrl: buildApprovalUrl(tool, record.actionId, record.confirmationCode, env),
            cancelUrl: buildCancelUrl(tool, record.actionId, record.confirmationCode, env),
            expiresAt: record.expiresAt,
            classification: "financial" as const,
          } satisfies StagedCompensation;
        });

      const approve = (input: { actionId: string; code: string }) =>
        Effect.tryPromise({
          try: async () => {
            ensureEnabled();
            const record = await assertPendingCode(input.actionId, input.code, env);
            if (record.status === "expired") {
              throw new CompensationError({ reason: "Action expired" });
            }
            if (record.status === "pending") {
              return {
                actionId: record.actionId,
                status: record.status,
                tool: record.tool,
                kind: record.kind,
                agentId: record.agentId,
                args: record.args,
                approvalUrl: buildApprovalUrl(
                  record.tool,
                  record.actionId,
                  record.confirmationCode,
                  env
                ),
                confirmUrl: buildConfirmUrl(
                  record.tool,
                  record.actionId,
                  record.confirmationCode,
                  env
                ),
                cancelUrl: buildCancelUrl(
                  record.tool,
                  record.actionId,
                  record.confirmationCode,
                  env
                ),
                expiresAt: record.expiresAt,
              } satisfies ApproveView;
            }
            return {
              actionId: record.actionId,
              status: record.status,
              tool: record.tool,
              kind: record.kind,
              agentId: record.agentId,
              args: record.args,
              approvalUrl: null,
              confirmUrl: null,
              cancelUrl: null,
              expiresAt: record.expiresAt,
            } satisfies ApproveView;
          },
          catch: (cause) =>
            cause instanceof CompensationError
              ? cause
              : new CompensationError({
                  reason: cause instanceof Error ? cause.message : "approve failed",
                  cause,
                }),
        });

      const executeDeposit = (record: PendingActionRecord) =>
        Effect.gen(function* () {
          const amountUsd = Number(record.args.amountUsd);
          const asset = record.args.asset === "funds" ? "funds" : "credits";
          const balance = yield* Effect.tryPromise({
            try: () =>
              creditAgentAccount(
                {
                  agentId: record.agentId,
                  creditsUsd: asset === "credits" ? amountUsd : 0,
                  fundsUsd: asset === "funds" ? amountUsd : 0,
                  tenantId: record.tenantId,
                },
                env
              ),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "credit failed",
                cause,
              }),
          });
          const reason = String(record.args.reason ?? "manual");
          const recruitmentId =
            typeof record.args.recruitmentId === "string" ? record.args.recruitmentId : undefined;
          yield* audit
            .appendEntry(
              buildCompensationDepositConfirmedEntry({
                tenantId: record.tenantId,
                actionId: record.actionId,
                agentId: record.agentId,
                amountUsd,
                asset,
                reason,
                recruitmentId,
                correlationId: record.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return {
            agentId: record.agentId,
            kind: asset === "funds" ? ("deposit_funds" as const) : ("deposit_credits" as const),
            amountUsd,
            balance,
            actionId: record.actionId,
          } satisfies DepositResult;
        });

      const executeCashout = (record: PendingActionRecord) =>
        Effect.gen(function* () {
          const amountUsd = Number(record.args.amountUsd);
          const source = record.args.source === "funds" ? "funds" : "credits";
          const destination = (
            record.args.destination === "usdc" ? "usdc" : "bank"
          ) as PayoutMethod;
          const rate = compensationCreditUsdRate(env);
          const payoutAmount =
            source === "credits" ? Math.round(amountUsd * rate * 100) / 100 : amountUsd;

          yield* Effect.tryPromise({
            try: () =>
              debitAgentAccount(
                {
                  agentId: record.agentId,
                  creditsUsd: source === "credits" ? amountUsd : 0,
                  fundsUsd: source === "funds" ? amountUsd : 0,
                },
                env
              ),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "debit failed",
                cause,
              }),
          });

          const payout = yield* payouts
            .createPayout({
              amountUsd: payoutAmount,
              destination,
              connectAccountId:
                typeof record.args.connectAccountId === "string"
                  ? record.args.connectAccountId
                  : undefined,
              usdcWallet:
                typeof record.args.usdcWallet === "string" ? record.args.usdcWallet : undefined,
              creatorId: record.agentId,
              tenantId: record.tenantId,
              description: `ClawQL agent compensation cash-out (${source})`,
              correlationId: record.correlationId ?? record.actionId,
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new CompensationError({
                    reason:
                      cause && typeof cause === "object" && "reason" in cause
                        ? String((cause as { reason: unknown }).reason)
                        : "payout failed",
                    cause,
                  })
              ),
              Effect.catchAll((err) =>
                Effect.gen(function* () {
                  // Debit already applied — restore ledger so failed cash-out is not a silent loss.
                  yield* Effect.tryPromise({
                    try: () =>
                      creditAgentAccount(
                        {
                          agentId: record.agentId,
                          creditsUsd: source === "credits" ? amountUsd : 0,
                          fundsUsd: source === "funds" ? amountUsd : 0,
                          tenantId: record.tenantId,
                        },
                        env
                      ),
                    catch: () => err,
                  }).pipe(Effect.catchAll(() => Effect.void));
                  return yield* Effect.fail(err);
                })
              )
            );

          const balance = yield* Effect.tryPromise({
            try: () => getAgentAccount(record.agentId, env).then((a) => a!),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "reload balance failed",
                cause,
              }),
          });

          yield* audit
            .appendEntry(
              buildCompensationCashoutCompletedEntry({
                tenantId: record.tenantId,
                actionId: record.actionId,
                agentId: record.agentId,
                amountUsd: payoutAmount,
                payoutId: payout.id,
                destination,
                source,
                correlationId: record.correlationId ?? record.actionId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return {
            agentId: record.agentId,
            amountUsd: payoutAmount,
            source,
            payout,
            balance,
            actionId: record.actionId,
          } satisfies CashoutResult;
        });

      const confirm = (input: { actionId: string; code: string }) =>
        Effect.gen(function* () {
          ensureEnabled();
          const record = yield* Effect.tryPromise({
            try: () => assertPendingCode(input.actionId, input.code, env),
            catch: (cause) =>
              cause instanceof CompensationError
                ? cause
                : new CompensationError({
                    reason: cause instanceof Error ? cause.message : "confirm lookup failed",
                    cause,
                  }),
          });
          if (record.status === "executed" && record.result) {
            return record.result as unknown as DepositResult | CashoutResult;
          }
          if (record.status === "cancelled") {
            return yield* Effect.fail(
              new CompensationError({ reason: "Action already cancelled" })
            );
          }
          if (record.status === "expired") {
            return yield* Effect.fail(new CompensationError({ reason: "Action expired" }));
          }
          if (record.status !== "pending") {
            return yield* Effect.fail(
              new CompensationError({ reason: `Action not pending (${record.status})` })
            );
          }

          const executed = yield* (
            record.kind === "cashout" ? executeCashout(record) : executeDeposit(record)
          ).pipe(
            Effect.catchAll((err) =>
              Effect.gen(function* () {
                const failureReason =
                  err instanceof CompensationError
                    ? err.reason
                    : err instanceof Error
                      ? err.message
                      : String(err);
                const amountUsd = Number(record.args.amountUsd);
                const recruitmentId =
                  typeof record.args.recruitmentId === "string"
                    ? record.args.recruitmentId
                    : undefined;
                if (record.kind === "cashout") {
                  yield* audit
                    .appendEntry(
                      buildCompensationCashoutFailedEntry({
                        tenantId: record.tenantId,
                        actionId: record.actionId,
                        agentId: record.agentId,
                        amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
                        failureReason,
                        destination:
                          typeof record.args.destination === "string"
                            ? record.args.destination
                            : undefined,
                        recruitmentId,
                        correlationId: record.correlationId,
                      })
                    )
                    .pipe(Effect.catchAll(() => Effect.void));
                } else {
                  yield* audit
                    .appendEntry(
                      buildCompensationDepositFailedEntry({
                        tenantId: record.tenantId,
                        actionId: record.actionId,
                        agentId: record.agentId,
                        amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
                        failureReason,
                        reason:
                          typeof record.args.reason === "string" ? record.args.reason : undefined,
                        recruitmentId,
                        correlationId: record.correlationId,
                      })
                    )
                    .pipe(Effect.catchAll(() => Effect.void));
                }
                return yield* Effect.fail(
                  err instanceof CompensationError
                    ? err
                    : new CompensationError({ reason: failureReason, cause: err })
                );
              })
            )
          );

          const updated: PendingActionRecord = {
            ...record,
            status: "executed",
            executedAt: new Date().toISOString(),
            result: executed as unknown as Record<string, unknown>,
          };
          yield* Effect.tryPromise({
            try: () => savePendingAction(updated, env),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "save pending failed",
                cause,
              }),
          });
          return executed;
        });

      const cancel = (input: { actionId: string; code: string }) =>
        Effect.gen(function* () {
          ensureEnabled();
          const record = yield* Effect.tryPromise({
            try: () => assertPendingCode(input.actionId, input.code, env),
            catch: (cause) =>
              cause instanceof CompensationError
                ? cause
                : new CompensationError({
                    reason: cause instanceof Error ? cause.message : "cancel lookup failed",
                    cause,
                  }),
          });
          if (record.status === "cancelled") {
            return { actionId: record.actionId, status: "cancelled" as const };
          }
          if (record.status === "executed") {
            return yield* Effect.fail(new CompensationError({ reason: "Action already executed" }));
          }
          if (record.status === "expired") {
            return yield* Effect.fail(new CompensationError({ reason: "Action expired" }));
          }
          const updated: PendingActionRecord = {
            ...record,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          };
          yield* Effect.tryPromise({
            try: () => savePendingAction(updated, env),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "save cancel failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCompensationCancelledEntry({
                tenantId: record.tenantId,
                actionId: record.actionId,
                agentId: record.agentId,
                kind: record.kind,
                recruitmentId:
                  typeof record.args.recruitmentId === "string"
                    ? record.args.recruitmentId
                    : undefined,
                correlationId: record.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return { actionId: record.actionId, status: "cancelled" as const };
        });

      const listPending = (input?: { agentId?: string; recruitmentId?: string }) =>
        Effect.tryPromise({
          try: async () => {
            ensureEnabled();
            return listPendingActions(env, {
              agentId: input?.agentId,
              recruitmentId: input?.recruitmentId,
              status: "pending",
            });
          },
          catch: (cause) =>
            new CompensationError({
              reason: cause instanceof Error ? cause.message : "list pending failed",
              cause,
            }),
        });

      const depositDirect = (input: {
        agentId: string;
        amountUsd: number;
        asset: "credits" | "funds";
        reason?: CompensationReason;
        tenantId?: string;
        correlationId?: string;
        recruitmentId?: string;
      }) =>
        Effect.gen(function* () {
          ensureEnabled();
          if (!isCompensationDirectAllowed(env)) {
            return yield* Effect.fail(
              new CompensationError({
                reason:
                  "Direct deposit disabled — use stageDeposit/confirm, or set CLAWQL_COMPENSATION_DIRECT=1",
              })
            );
          }
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new CompensationError({ reason: "amountUsd must be > 0" }));
          }
          const balance = yield* Effect.tryPromise({
            try: () =>
              creditAgentAccount(
                {
                  agentId: input.agentId,
                  creditsUsd: input.asset === "credits" ? input.amountUsd : 0,
                  fundsUsd: input.asset === "funds" ? input.amountUsd : 0,
                  tenantId: input.tenantId,
                },
                env
              ),
            catch: (cause) =>
              new CompensationError({
                reason: cause instanceof Error ? cause.message : "direct credit failed",
                cause,
              }),
          });
          yield* audit
            .appendEntry(
              buildCompensationDepositConfirmedEntry({
                tenantId: input.tenantId?.trim() || "default",
                actionId: `direct_${Date.now().toString(36)}`,
                agentId: input.agentId.trim(),
                amountUsd: input.amountUsd,
                asset: input.asset,
                reason: input.reason ?? "manual",
                recruitmentId: input.recruitmentId,
                correlationId: input.correlationId ?? input.recruitmentId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return {
            agentId: input.agentId.trim(),
            kind:
              input.asset === "funds" ? ("deposit_funds" as const) : ("deposit_credits" as const),
            amountUsd: input.amountUsd,
            balance,
            dryRun: false,
          } satisfies DepositResult;
        });

      return AgentCompensationService.of({
        getAccount,
        setPreference,
        stageDeposit,
        stageCashout,
        approve,
        confirm,
        cancel,
        listPending,
        depositDirect,
      });
    })
  );
}
