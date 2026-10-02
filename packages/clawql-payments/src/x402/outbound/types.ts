/**
 * Outbound x402 payer types — batch WORM fields + failure reasons.
 * @see docs/specs/execute/execute-batching-v0.1.md#outbound-402-payer
 * @see docs/specs/spend/spend-governance-v0.1.md
 */

export type OutboundX402FailureReason =
  | "outbound_disabled"
  | "policy_missing"
  | "policy_denied"
  | "hook_blocked"
  | "hitl_required"
  | "quote_mismatch"
  | "sign_failed"
  | "signer_frozen"
  | "settle_unconfirmed"
  | "facilitator_rejected"
  | "network_error";

export type ExecuteBatchPaymentFields = {
  readonly kind: "outbound_payment";
  readonly protocol: "x402" | "mpp";
  readonly resourceUrl: string;
  readonly method: string;
  readonly quoteDigest: string;
  readonly amount: string;
  readonly asset: string;
  readonly network: string;
  /** Payer address only — never key material. */
  readonly payer: string;
  readonly payee: string;
  readonly txHash?: string;
  readonly facilitator: string;
  readonly hookDecision: "allow" | "deny" | "hitl";
  readonly hookPolicyVersion: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
};

export type ExecuteBatchCompletedFields = {
  readonly batchId: string;
  readonly batchName: "outbound-x402-pay";
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly innerCallCount: number;
  readonly success: boolean;
  readonly failureReason?: OutboundX402FailureReason;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly payment?: ExecuteBatchPaymentFields;
};

export type OutboundX402PaySuccess = {
  readonly ok: true;
  readonly status: number;
  readonly body: string;
  readonly batch: ExecuteBatchCompletedFields;
};

export type OutboundX402PayFailure = {
  readonly ok: false;
  readonly reason: OutboundX402FailureReason;
  readonly detail?: string;
  readonly batch: ExecuteBatchCompletedFields;
};

export type OutboundX402PayResult = OutboundX402PaySuccess | OutboundX402PayFailure;

export type OutboundX402QuoteTerms = {
  readonly scheme: string;
  readonly network: string;
  /** Atomic USDC string from PAYMENT-REQUIRED. */
  readonly amountAtomic: string;
  readonly asset: string;
  readonly payTo: string;
  readonly maxTimeoutSeconds?: number;
  readonly extra?: Record<string, string>;
};

export type OutboundSpendCounters = {
  readonly dayReservedUsdc: string;
  readonly daySettledUsdc: string;
  readonly sessionReservedUsdc: string;
  readonly sessionSettledUsdc: string;
};

export type OutboundTenantState = {
  readonly outboundPaymentEverEnabled: boolean;
  readonly policyVersionId: string;
};
