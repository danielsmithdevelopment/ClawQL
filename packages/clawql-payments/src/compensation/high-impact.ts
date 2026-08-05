/**
 * High-impact financial tool classification (DAOS coordination-layer).
 *
 * Until PEP/NATS PENDING_ACTIONS ships in clawql-ouroboros, payments uses this
 * registry + file-backed staging for compensation (and optionally other money tools).
 *
 * MCP tool names use underscores (MCP-safe). Logical dotted form:
 *   agent.compensation.deposit.stage → agent_compensation_deposit_stage
 */

export type HighImpactClassification = "financial" | "external_write" | "destructive";

/** Tools that must never execute on a single GET / unconfirmed call. */
export const HIGH_IMPACT_PAYMENT_TOOLS: Record<string, HighImpactClassification> = {
  transfer_funds: "financial",
  payments_credits_transfer: "financial",
  payments_credits_transfer_stage: "financial",
  payments_credits_transfer_confirm: "financial",
  payments_payout_create: "financial",
  payments_ramp_agent_card_issue: "financial",
  payments_offramp_session_create: "financial",
  agent_compensation_deposit_stage: "financial",
  agent_compensation_deposit_confirm: "financial",
  agent_compensation_cashout_stage: "financial",
  agent_compensation_cashout_confirm: "financial",
};

export function classifyPaymentTool(toolName: string): HighImpactClassification | undefined {
  return HIGH_IMPACT_PAYMENT_TOOLS[toolName];
}

export function isHighImpactPaymentTool(toolName: string): boolean {
  return Boolean(classifyPaymentTool(toolName));
}

/** Stage tool id used in PENDING_ACTIONS + approval_url paths. */
export const COMPENSATION_DEPOSIT_STAGE_TOOL = "agent_compensation_deposit_stage";
export const COMPENSATION_DEPOSIT_CONFIRM_TOOL = "agent_compensation_deposit_confirm";
export const COMPENSATION_CASHOUT_STAGE_TOOL = "agent_compensation_cashout_stage";
export const COMPENSATION_CASHOUT_CONFIRM_TOOL = "agent_compensation_cashout_confirm";

/** @deprecated Use COMPENSATION_DEPOSIT_STAGE_TOOL */
export const COMPENSATION_DEPOSIT_TOOL = COMPENSATION_DEPOSIT_STAGE_TOOL;
/** @deprecated Use COMPENSATION_CASHOUT_STAGE_TOOL */
export const COMPENSATION_CASHOUT_TOOL = COMPENSATION_CASHOUT_STAGE_TOOL;
