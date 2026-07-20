/**
 * Shared types for the SGDOP Coordinator ↔ compensation stage-only port.
 * Kept separate from staging-port.ts / agent-compensation-service.ts to avoid cycles.
 */

/** Stable id for one SGDOP recruitment episode (blind-spot batch). */
export type RecruitmentId = string;

/** Reasons the Coordinator is allowed to emit when staging pay. */
export type CoordinatorCompensationReason = "sgdop_recruit" | "diversity_dividend";

/** Optional Command Deck / escalation metadata (never secrets). */
export type StageRecruitCompensationMeta = {
  embeddingModelVersion?: string;
  nsv?: number;
  sgdop?: number;
  /** Unit vector — same axis as ReputationUpdate.directive.blind_spot_direction */
  blindSpotDirection?: number[];
  bountyKind?: "recruit_bounty" | "diversity_dividend_share";
};

/** Input the Coordinator is allowed to emit (stage-only). */
export type StageRecruitCompensationInput = {
  agentId: string;
  amountUsd: number;
  /** Prefer credits for swarm budget; funds only when treasury already allocated. */
  asset?: "credits" | "funds";
  reason: CoordinatorCompensationReason;
  recruitmentId: RecruitmentId;
  /** Session / escalation correlation when distinct from recruitmentId. */
  correlationId?: string;
  tenantId?: string;
  meta?: StageRecruitCompensationMeta;
};

export type StagedCompensationHandle = {
  actionId: string;
  confirmationCode: string;
  approvalUrl: string;
  cancelUrl: string;
  expiresAt: string;
  agentId: string;
  amountUsd: number;
  classification: "financial";
  /** True when an existing pending deposit for the same idempotency key was returned. */
  idempotentReplay?: boolean;
};

/**
 * Port implemented by clawql-payments. Coordinator must not see confirm/depositDirect.
 */
export interface CompensationStagingPort {
  stageRecruitDeposit(input: StageRecruitCompensationInput): Promise<StagedCompensationHandle>;
  /** Open staged deposits for a recruitmentId (ops / cancel-on-Blind). */
  listStagedForRecruitment(recruitmentId: RecruitmentId): Promise<StagedCompensationHandle[]>;
}
