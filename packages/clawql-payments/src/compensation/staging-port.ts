/**
 * Narrow stage-only port for a future SGDOP Coordinator.
 *
 * Confirms / depositDirect / PayoutService are intentionally absent — see
 * docs/payments/sgdop-coordinator-compensation-bridge.md.
 */

import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  AgentCompensationService,
  CompensationError,
  type CompensationReason,
  type StagedCompensation,
} from "./agent-compensation-service.js";
import { buildApprovalUrl, buildCancelUrl, listPendingActions } from "./pending-actions.js";
import type {
  CompensationStagingPort,
  RecruitmentId,
  StageRecruitCompensationInput,
  StagedCompensationHandle,
} from "./staging-types.js";

export type {
  CompensationStagingPort,
  CoordinatorCompensationReason,
  RecruitmentId,
  StageRecruitCompensationInput,
  StageRecruitCompensationMeta,
  StagedCompensationHandle,
} from "./staging-types.js";

function toHandle(staged: StagedCompensation): StagedCompensationHandle {
  return {
    actionId: staged.actionId,
    confirmationCode: staged.confirmationCode,
    approvalUrl: staged.approvalUrl,
    cancelUrl: staged.cancelUrl,
    expiresAt: staged.expiresAt,
    agentId: staged.agentId,
    amountUsd: staged.amountUsd,
    classification: "financial",
    idempotentReplay: staged.idempotentReplay,
  };
}

function recordToHandle(
  record: {
    actionId: string;
    confirmationCode: string;
    tool: string;
    agentId: string;
    args: Record<string, unknown>;
    expiresAt: string;
  },
  env: NodeJS.ProcessEnv
): StagedCompensationHandle {
  const amountUsd = Number(record.args.amountUsd);
  return {
    actionId: record.actionId,
    confirmationCode: record.confirmationCode,
    approvalUrl: buildApprovalUrl(record.tool, record.actionId, record.confirmationCode, env),
    cancelUrl: buildCancelUrl(record.tool, record.actionId, record.confirmationCode, env),
    expiresAt: record.expiresAt,
    agentId: record.agentId,
    amountUsd: Number.isFinite(amountUsd) ? amountUsd : 0,
    classification: "financial",
  };
}

/**
 * Promise-based adapter over AgentCompensationService for Coordinator callers
 * that do not want an Effect dependency at the call site.
 */
export function makeCompensationStagingPort(
  env: NodeJS.ProcessEnv = process.env
): CompensationStagingPort {
  return {
    async stageRecruitDeposit(input: StageRecruitCompensationInput) {
      try {
        const staged = await runPaymentsEffect(
          Effect.gen(function* () {
            const comp = yield* AgentCompensationService;
            return yield* comp.stageDeposit({
              agentId: input.agentId,
              amountUsd: input.amountUsd,
              asset: input.asset ?? "credits",
              reason: input.reason as CompensationReason,
              recruitmentId: input.recruitmentId,
              correlationId: input.correlationId ?? input.recruitmentId,
              tenantId: input.tenantId,
              meta: input.meta,
            });
          }),
          env
        );
        return toHandle(staged);
      } catch (cause) {
        if (cause instanceof CompensationError) throw cause;
        throw new CompensationError({
          reason: cause instanceof Error ? cause.message : "stageRecruitDeposit failed",
          cause,
        });
      }
    },

    async listStagedForRecruitment(recruitmentId: RecruitmentId) {
      const rid = recruitmentId.trim();
      if (!rid) return [];
      const records = await listPendingActions(env, {
        recruitmentId: rid,
        status: "pending",
        kindPrefix: "deposit",
      });
      return records.map((r) => recordToHandle(r, env));
    },
  };
}
