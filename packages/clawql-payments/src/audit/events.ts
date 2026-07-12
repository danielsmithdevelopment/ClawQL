export type PaymentEventKind =
  | "STRIPE_SUBSCRIPTION_CREATED"
  | "STRIPE_INVOICE_PAID"
  | "STRIPE_PAYMENT_FAILED"
  | "STRIPE_METER_REPORTED"
  | "X402_PAYMENT_RECEIVED"
  | "X402_PAYMENT_FAILED"
  | "ENTITLEMENT_LIMIT_REACHED"
  | "PLAN_UPGRADED"
  | "PLAN_DOWNGRADED";

export type PaymentProvider = "stripe" | "x402";

export type PaymentWormPayload = {
  provider: PaymentProvider;
  amount_usd?: number;
  amount_usdc?: number;
  tenant_id: string;
  plan?: string;
  resource?: string;
  agent_id?: string;
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
