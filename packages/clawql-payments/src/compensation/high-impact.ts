/**
 * High-impact financial tool classification (DAOS coordination-layer).
 *
 * Until PEP/NATS PENDING_ACTIONS ships in clawql-ouroboros, payments uses this
 * registry + file-backed staging for compensation (and optionally other money tools).
 */

export type HighImpactClassification = "financial" | "external_write" | "destructive";

/** Tools that must never execute on a single GET / unconfirmed call. */
export const HIGH_IMPACT_PAYMENT_TOOLS: Record<string, HighImpactClassification> = {
  transfer_funds: "financial",
  payments_payout_create: "financial",
  payments_ramp_agent_card_issue: "financial",
  payments_offramp_session_create: "financial",
  payments_compensation_deposit: "financial",
  payments_compensation_cashout: "financial",
};

export function classifyPaymentTool(toolName: string): HighImpactClassification | undefined {
  return HIGH_IMPACT_PAYMENT_TOOLS[toolName];
}

export function isHighImpactPaymentTool(toolName: string): boolean {
  return Boolean(classifyPaymentTool(toolName));
}

export const COMPENSATION_DEPOSIT_TOOL = "payments_compensation_deposit";
export const COMPENSATION_CASHOUT_TOOL = "payments_compensation_cashout";
