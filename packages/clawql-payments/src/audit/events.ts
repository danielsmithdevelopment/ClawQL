export type PaymentEventKind =
  | "STRIPE_SUBSCRIPTION_CREATED"
  | "STRIPE_INVOICE_PAID"
  | "STRIPE_PAYMENT_FAILED"
  | "STRIPE_METER_REPORTED"
  | "X402_PAYMENT_RECEIVED"
  | "X402_PAYMENT_FAILED"
  | "ENTITLEMENT_LIMIT_REACHED"
  | "PLAN_UPGRADED"
  | "PLAN_DOWNGRADED"
  | "AP2_MANDATE_VERIFIED"
  | "AP2_MANDATE_FAILED"
  | "ACP_CHECKOUT_CREATED"
  | "ACP_CHECKOUT_COMPLETED"
  | "PAYPAL_ORDER_CREATED"
  | "PAYPAL_ORDER_CAPTURED"
  | "PAYPAL_CAPTURE_FAILED"
  | "ADYEN_SESSION_CREATED"
  | "ADYEN_PAYMENT_AUTHORIZED"
  | "ADYEN_PAYMENT_FAILED"
  | "ADYEN_WEBHOOK_PROCESSED"
  | "CONNECT_ACCOUNT_CREATED"
  | "PAYOUT_INITIATED"
  | "PAYOUT_PAID"
  | "PAYOUT_FAILED"
  | "RAMP_FUND_CREATED"
  | "RAMP_VIRTUAL_CARD_ISSUED"
  | "RAMP_AGENT_CARD_ISSUED"
  | "OFFRAMP_SESSION_CREATED"
  | "OFFRAMP_UPDATED"
  | "OFFRAMP_COMPLETED"
  | "OFFRAMP_FAILED"
  | "BANK_LINKED"
  | "CREDIT_TOPUP_PENDING"
  | "CREDIT_TOPUP_SETTLED"
  | "CREDIT_TOPUP_FAILED"
  | "CREDIT_DEBITED"
  | "COMPENSATION_DEPOSIT_STAGED"
  | "COMPENSATION_DEPOSIT_CONFIRMED"
  | "COMPENSATION_CASHOUT_STAGED"
  | "COMPENSATION_CASHOUT_COMPLETED"
  | "COMPENSATION_CANCELLED";

export type PaymentProvider =
  | "stripe"
  | "x402"
  | "ap2"
  | "acp"
  | "paypal"
  | "adyen"
  | "ramp"
  | "payouts"
  | "offramp"
  | "credits"
  | "compensation";

export type PaymentWormPayload = {
  provider: PaymentProvider;
  amount_usd?: number;
  amount_usdc?: number;
  tenant_id: string;
  plan?: string;
  resource?: string;
  agent_id?: string;
  balance_usd?: number;
  /** Compensation reason (e.g. sgdop_recruit). */
  reason?: string;
  /** SGDOP recruitment / blind-spot correlation. */
  recruitment_id?: string;
};

/** Durable payment audit entry with hash-chained integrity fields on disk. */
export type PaymentWormEntry = {
  ts: string;
  category: "payment";
  action: PaymentEventKind;
  summary: string;
  correlationId?: string;
  payload: PaymentWormPayload;
};

export function buildPaymentWormEntry(input: {
  eventKind: PaymentEventKind;
  summary: string;
  payload: PaymentWormPayload;
  correlationId?: string;
}): PaymentWormEntry {
  return {
    ts: new Date().toISOString(),
    category: "payment",
    action: input.eventKind,
    summary: input.summary,
    correlationId: input.correlationId,
    payload: input.payload,
  };
}

export function buildStripeInvoicePaidEntry(input: {
  tenantId: string;
  amountUsd: number;
  plan?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "STRIPE_INVOICE_PAID",
    summary: `Stripe invoice paid $${input.amountUsd.toFixed(2)} for tenant ${input.tenantId}`,
    correlationId: input.correlationId,
    payload: {
      provider: "stripe",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      plan: input.plan,
    },
  });
}

export function buildX402PaymentReceivedEntry(input: {
  tenantId: string;
  amountUsdc: number;
  resource: string;
  agentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "X402_PAYMENT_RECEIVED",
    summary: `x402 payment ${input.amountUsdc} USDC for ${input.resource}`,
    correlationId: input.correlationId,
    payload: {
      provider: "x402",
      amount_usdc: input.amountUsdc,
      tenant_id: input.tenantId,
      resource: input.resource,
      agent_id: input.agentId,
    },
  });
}

export function buildX402PaymentFailedEntry(input: {
  tenantId: string;
  resource: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "X402_PAYMENT_FAILED",
    summary: `x402 payment failed for ${input.resource}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "x402",
      tenant_id: input.tenantId,
      resource: input.resource,
    },
  });
}

export function buildEntitlementLimitReachedEntry(input: {
  tenantId: string;
  plan: string;
  resource: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ENTITLEMENT_LIMIT_REACHED",
    summary: `Entitlement limit reached for ${input.resource} on plan ${input.plan}`,
    correlationId: input.correlationId,
    payload: {
      provider: "stripe",
      tenant_id: input.tenantId,
      plan: input.plan,
      resource: input.resource,
    },
  });
}

export function buildPlanChangedEntry(input: {
  tenantId: string;
  fromPlan: string;
  toPlan: string;
  upgraded: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: input.upgraded ? "PLAN_UPGRADED" : "PLAN_DOWNGRADED",
    summary: `Plan ${input.upgraded ? "upgrade" : "downgrade"} ${input.fromPlan} → ${input.toPlan}`,
    correlationId: input.correlationId,
    payload: {
      provider: "stripe",
      tenant_id: input.tenantId,
      plan: input.toPlan,
    },
  });
}

export function buildStripeMeterReportedEntry(input: {
  tenantId: string;
  value: number;
  eventName: string;
  stripeCustomerId: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "STRIPE_METER_REPORTED",
    summary: `Stripe meter ${input.eventName} +${input.value} for tenant ${input.tenantId}`,
    correlationId: input.correlationId,
    payload: {
      provider: "stripe",
      tenant_id: input.tenantId,
      resource: input.eventName,
    },
  });
}

export function buildAp2MandateVerifiedEntry(input: {
  tenantId: string;
  resource: string;
  mandateId?: string;
  signed?: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "AP2_MANDATE_VERIFIED",
    summary: `AP2 mandate verified for ${input.resource}${input.mandateId ? ` (${input.mandateId})` : ""}${input.signed ? " [signed]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "ap2",
      tenant_id: input.tenantId,
      resource: input.resource,
      agent_id: input.mandateId,
    },
  });
}

export function buildAp2MandateFailedEntry(input: {
  tenantId: string;
  resource: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "AP2_MANDATE_FAILED",
    summary: `AP2 mandate failed for ${input.resource}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "ap2",
      tenant_id: input.tenantId,
      resource: input.resource,
    },
  });
}

export function buildAcpCheckoutCreatedEntry(input: {
  tenantId: string;
  checkoutSessionId: string;
  amountUsd: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ACP_CHECKOUT_CREATED",
    summary: `ACP checkout ${input.checkoutSessionId} created ($${input.amountUsd.toFixed(2)})`,
    correlationId: input.correlationId,
    payload: {
      provider: "acp",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.checkoutSessionId,
    },
  });
}

export function buildAcpCheckoutCompletedEntry(input: {
  tenantId: string;
  checkoutSessionId: string;
  amountUsd: number;
  paymentIntentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ACP_CHECKOUT_COMPLETED",
    summary: `ACP checkout ${input.checkoutSessionId} completed ($${input.amountUsd.toFixed(2)})`,
    correlationId: input.correlationId,
    payload: {
      provider: "acp",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.paymentIntentId ?? input.checkoutSessionId,
    },
  });
}

export function buildPaypalOrderCreatedEntry(input: {
  tenantId: string;
  orderId: string;
  amountUsd: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYPAL_ORDER_CREATED",
    summary: `PayPal order ${input.orderId} created ($${input.amountUsd.toFixed(2)})`,
    correlationId: input.correlationId,
    payload: {
      provider: "paypal",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.orderId,
    },
  });
}

export function buildPaypalOrderCapturedEntry(input: {
  tenantId: string;
  orderId: string;
  amountUsd?: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYPAL_ORDER_CAPTURED",
    summary: `PayPal order ${input.orderId} captured${input.amountUsd !== undefined ? ` ($${input.amountUsd.toFixed(2)})` : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "paypal",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.orderId,
    },
  });
}

export function buildPaypalCaptureFailedEntry(input: {
  tenantId: string;
  orderId: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYPAL_CAPTURE_FAILED",
    summary: `PayPal capture failed for ${input.orderId}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "paypal",
      tenant_id: input.tenantId,
      resource: input.orderId,
    },
  });
}

export function buildAdyenSessionCreatedEntry(input: {
  tenantId: string;
  sessionId: string;
  amountUsd: number;
  reference?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ADYEN_SESSION_CREATED",
    summary: `Adyen session ${input.sessionId} created ($${input.amountUsd.toFixed(2)})`,
    correlationId: input.correlationId,
    payload: {
      provider: "adyen",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.reference ?? input.sessionId,
    },
  });
}

export function buildAdyenPaymentAuthorizedEntry(input: {
  tenantId: string;
  pspReference?: string;
  amountUsd?: number;
  reference?: string;
  resultCode?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ADYEN_PAYMENT_AUTHORIZED",
    summary: `Adyen payment authorised${input.pspReference ? ` ${input.pspReference}` : ""}${input.amountUsd !== undefined ? ` ($${input.amountUsd.toFixed(2)})` : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "adyen",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.pspReference ?? input.reference,
    },
  });
}

export function buildAdyenPaymentFailedEntry(input: {
  tenantId: string;
  reference?: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ADYEN_PAYMENT_FAILED",
    summary: `Adyen payment failed${input.reference ? ` for ${input.reference}` : ""}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "adyen",
      tenant_id: input.tenantId,
      resource: input.reference,
    },
  });
}

export function buildAdyenWebhookProcessedEntry(input: {
  tenantId: string;
  eventCode: string;
  success: boolean;
  pspReference?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "ADYEN_WEBHOOK_PROCESSED",
    summary: `Adyen webhook ${input.eventCode} success=${input.success}${input.pspReference ? ` (${input.pspReference})` : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "adyen",
      tenant_id: input.tenantId,
      resource: input.pspReference ?? input.eventCode,
    },
  });
}

export function buildConnectAccountCreatedEntry(input: {
  tenantId: string;
  accountId: string;
  email?: string;
  dryRun?: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "CONNECT_ACCOUNT_CREATED",
    summary: `Stripe Connect account ${input.accountId} created${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "payouts",
      tenant_id: input.tenantId,
      resource: input.accountId,
      agent_id: input.email,
    },
  });
}

export function buildPayoutInitiatedEntry(input: {
  tenantId: string;
  payoutId: string;
  amountUsd: number;
  destination: "bank" | "usdc";
  dryRun?: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYOUT_INITIATED",
    summary: `Payout ${input.payoutId} initiated $${input.amountUsd.toFixed(2)} → ${input.destination}${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "payouts",
      amount_usd: input.destination === "bank" ? input.amountUsd : undefined,
      amount_usdc: input.destination === "usdc" ? input.amountUsd : undefined,
      tenant_id: input.tenantId,
      resource: input.payoutId,
    },
  });
}

export function buildPayoutPaidEntry(input: {
  tenantId: string;
  payoutId: string;
  amountUsd: number;
  destination: "bank" | "usdc";
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYOUT_PAID",
    summary: `Payout ${input.payoutId} paid $${input.amountUsd.toFixed(2)} → ${input.destination}`,
    correlationId: input.correlationId,
    payload: {
      provider: "payouts",
      amount_usd: input.destination === "bank" ? input.amountUsd : undefined,
      amount_usdc: input.destination === "usdc" ? input.amountUsd : undefined,
      tenant_id: input.tenantId,
      resource: input.payoutId,
    },
  });
}

export function buildPayoutFailedEntry(input: {
  tenantId: string;
  payoutId?: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "PAYOUT_FAILED",
    summary: `Payout failed${input.payoutId ? ` ${input.payoutId}` : ""}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "payouts",
      tenant_id: input.tenantId,
      resource: input.payoutId,
    },
  });
}

export function buildRampFundCreatedEntry(input: {
  tenantId: string;
  fundId: string;
  displayName: string;
  limitUsd: number;
  dryRun?: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "RAMP_FUND_CREATED",
    summary: `Ramp fund ${input.fundId} (${input.displayName}) limit $${input.limitUsd.toFixed(2)}${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "ramp",
      amount_usd: input.limitUsd,
      tenant_id: input.tenantId,
      resource: input.fundId,
    },
  });
}

export function buildRampVirtualCardIssuedEntry(input: {
  tenantId: string;
  cardId: string;
  fundId?: string;
  lastFour?: string;
  dryRun?: boolean;
  correlationId?: string;
  agentId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "RAMP_VIRTUAL_CARD_ISSUED",
    summary: `Ramp virtual card ${input.cardId}${input.lastFour ? ` ****${input.lastFour}` : ""} issued${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "ramp",
      tenant_id: input.tenantId,
      resource: input.cardId,
      agent_id: input.agentId,
    },
  });
}

export function buildRampAgentCardIssuedEntry(input: {
  tenantId: string;
  cardId: string;
  fundId?: string;
  amountUsd: number;
  lastFour?: string;
  dryRun?: boolean;
  correlationId?: string;
  agentId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "RAMP_AGENT_CARD_ISSUED",
    summary: `Ramp agent card ${input.cardId} capped $${input.amountUsd.toFixed(2)}${input.lastFour ? ` ****${input.lastFour}` : ""}${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "ramp",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.cardId,
      agent_id: input.agentId,
    },
  });
}

export function buildOfframpSessionCreatedEntry(input: {
  tenantId: string;
  sessionId: string;
  provider: "moonpay" | "transak";
  amountUsd: number;
  walletAddress: string;
  dryRun?: boolean;
  correlationId?: string;
  creatorId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "OFFRAMP_SESSION_CREATED",
    summary: `Off-ramp ${input.provider} session ${input.sessionId} $${input.amountUsd.toFixed(2)}${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "offramp",
      amount_usdc: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.sessionId,
      agent_id: input.creatorId ?? input.walletAddress,
    },
  });
}

export function buildOfframpUpdatedEntry(input: {
  tenantId: string;
  transactionId: string;
  provider: "moonpay" | "transak";
  status: string;
  amountUsd?: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "OFFRAMP_UPDATED",
    summary: `Off-ramp ${input.provider} ${input.transactionId} status=${input.status}`,
    correlationId: input.correlationId,
    payload: {
      provider: "offramp",
      amount_usdc: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.transactionId,
      agent_id: input.status,
    },
  });
}

export function buildOfframpCompletedEntry(input: {
  tenantId: string;
  transactionId: string;
  provider: "moonpay" | "transak";
  amountUsd?: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "OFFRAMP_COMPLETED",
    summary: `Off-ramp ${input.provider} completed ${input.transactionId}${input.amountUsd != null ? ` $${input.amountUsd.toFixed(2)}` : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "offramp",
      amount_usdc: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.transactionId,
    },
  });
}

export function buildOfframpFailedEntry(input: {
  tenantId: string;
  transactionId: string;
  provider: "moonpay" | "transak";
  reason: string;
  amountUsd?: number;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "OFFRAMP_FAILED",
    summary: `Off-ramp ${input.provider} failed ${input.transactionId}: ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "offramp",
      amount_usdc: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.transactionId,
      agent_id: input.reason.slice(0, 120),
    },
  });
}

export function buildBankLinkedEntry(input: {
  tenantId: string;
  customerId: string;
  sessionId: string;
  dryRun?: boolean;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "BANK_LINKED",
    summary: `Bank link session ${input.sessionId} for ${input.customerId}${input.dryRun ? " [dry-run]" : ""}`,
    correlationId: input.correlationId,
    payload: {
      provider: "credits",
      tenant_id: input.tenantId,
      resource: input.sessionId,
    },
  });
}

export function buildCreditTopupPendingEntry(input: {
  tenantId: string;
  amountUsd: number;
  paymentIntentId: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "CREDIT_TOPUP_PENDING",
    summary: `Credit top-up pending $${input.amountUsd.toFixed(2)} (${input.paymentIntentId})`,
    correlationId: input.correlationId,
    payload: {
      provider: "credits",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.paymentIntentId,
    },
  });
}

export function buildCreditTopupSettledEntry(input: {
  tenantId: string;
  amountUsd: number;
  balanceUsd: number;
  paymentIntentId: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "CREDIT_TOPUP_SETTLED",
    summary: `Credit top-up settled $${input.amountUsd.toFixed(2)} → balance $${input.balanceUsd.toFixed(2)}`,
    correlationId: input.correlationId,
    payload: {
      provider: "credits",
      amount_usd: input.amountUsd,
      balance_usd: input.balanceUsd,
      tenant_id: input.tenantId,
      resource: input.paymentIntentId,
    },
  });
}

export function buildCreditTopupFailedEntry(input: {
  tenantId: string;
  amountUsd: number;
  paymentIntentId: string;
  reason: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "CREDIT_TOPUP_FAILED",
    summary: `Credit top-up failed $${input.amountUsd.toFixed(2)} (${input.paymentIntentId}): ${input.reason}`,
    correlationId: input.correlationId,
    payload: {
      provider: "credits",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.paymentIntentId,
    },
  });
}

export function buildCreditDebitedEntry(input: {
  tenantId: string;
  amountUsd: number;
  balanceUsd: number;
  resource?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "CREDIT_DEBITED",
    summary: `Credits debited $${input.amountUsd.toFixed(2)} → balance $${input.balanceUsd.toFixed(2)}`,
    correlationId: input.correlationId,
    payload: {
      provider: "credits",
      amount_usd: input.amountUsd,
      balance_usd: input.balanceUsd,
      tenant_id: input.tenantId,
      resource: input.resource,
    },
  });
}

export function buildCompensationDepositStagedEntry(input: {
  tenantId: string;
  actionId: string;
  agentId: string;
  amountUsd: number;
  asset: "credits" | "funds";
  reason?: string;
  recruitmentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "COMPENSATION_DEPOSIT_STAGED",
    summary: `Compensation deposit staged ${input.asset} $${input.amountUsd.toFixed(2)} for ${input.agentId}${input.reason ? ` (${input.reason})` : ""}`,
    correlationId: input.correlationId ?? input.recruitmentId ?? input.actionId,
    payload: {
      provider: "compensation",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.actionId,
      agent_id: input.agentId,
      plan: input.asset,
      reason: input.reason,
      recruitment_id: input.recruitmentId,
    },
  });
}

export function buildCompensationDepositConfirmedEntry(input: {
  tenantId: string;
  actionId: string;
  agentId: string;
  amountUsd: number;
  asset: "credits" | "funds";
  reason?: string;
  recruitmentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "COMPENSATION_DEPOSIT_CONFIRMED",
    summary: `Compensation deposit confirmed ${input.asset} $${input.amountUsd.toFixed(2)} → ${input.agentId}${input.reason ? ` (${input.reason})` : ""}`,
    correlationId: input.correlationId ?? input.recruitmentId ?? input.actionId,
    payload: {
      provider: "compensation",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.actionId,
      agent_id: input.agentId,
      plan: input.asset,
      reason: input.reason,
      recruitment_id: input.recruitmentId,
    },
  });
}

export function buildCompensationCashoutStagedEntry(input: {
  tenantId: string;
  actionId: string;
  agentId: string;
  amountUsd: number;
  destination: string;
  source?: "credits" | "funds";
  recruitmentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "COMPENSATION_CASHOUT_STAGED",
    summary: `Compensation cash-out staged $${input.amountUsd.toFixed(2)} → ${input.destination} for ${input.agentId}`,
    correlationId: input.correlationId ?? input.recruitmentId ?? input.actionId,
    payload: {
      provider: "compensation",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.actionId,
      agent_id: input.agentId,
      plan: input.destination,
      reason: input.source,
      recruitment_id: input.recruitmentId,
    },
  });
}

export function buildCompensationCashoutCompletedEntry(input: {
  tenantId: string;
  actionId: string;
  agentId: string;
  amountUsd: number;
  payoutId: string;
  destination: string;
  source?: "credits" | "funds";
  recruitmentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "COMPENSATION_CASHOUT_COMPLETED",
    summary: `Compensation cash-out completed $${input.amountUsd.toFixed(2)} payout ${input.payoutId}`,
    correlationId: input.correlationId ?? input.recruitmentId ?? input.actionId,
    payload: {
      provider: "compensation",
      amount_usd: input.amountUsd,
      tenant_id: input.tenantId,
      resource: input.payoutId,
      agent_id: input.agentId,
      plan: input.destination,
      reason: input.source,
      recruitment_id: input.recruitmentId,
    },
  });
}

export function buildCompensationCancelledEntry(input: {
  tenantId: string;
  actionId: string;
  agentId: string;
  kind?: string;
  recruitmentId?: string;
  correlationId?: string;
}): PaymentWormEntry {
  return buildPaymentWormEntry({
    eventKind: "COMPENSATION_CANCELLED",
    summary: `Compensation action cancelled ${input.actionId} for ${input.agentId}`,
    correlationId: input.correlationId ?? input.recruitmentId ?? input.actionId,
    payload: {
      provider: "compensation",
      tenant_id: input.tenantId,
      resource: input.actionId,
      agent_id: input.agentId,
      plan: input.kind,
      recruitment_id: input.recruitmentId,
    },
  });
}
