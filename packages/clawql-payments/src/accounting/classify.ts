import type { PaymentEventKind, PaymentWormEntry, PaymentWormPayload } from "../audit/events.js";
import type {
  AccountingCategory,
  AccountingDirection,
  PaymentAccounting,
  TaxTreatment,
} from "./types.js";

type Classified = {
  direction: AccountingDirection;
  category: AccountingCategory;
  taxTreatment: TaxTreatment;
  counterpartyKind?: PaymentAccounting["counterpartyKind"];
};

const KIND_MAP: Record<PaymentEventKind, Classified> = {
  STRIPE_SUBSCRIPTION_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  STRIPE_INVOICE_PAID: {
    direction: "inflow",
    category: "saas_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  STRIPE_PAYMENT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  STRIPE_METER_REPORTED: {
    direction: "internal",
    category: "usage_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  X402_PAYMENT_RECEIVED: {
    direction: "inflow",
    category: "micropayment_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  X402_PAYMENT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  ENTITLEMENT_LIMIT_REACHED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  PLAN_UPGRADED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  PLAN_DOWNGRADED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  AP2_MANDATE_VERIFIED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  AP2_MANDATE_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  ACP_CHECKOUT_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  ACP_CHECKOUT_COMPLETED: {
    direction: "inflow",
    category: "usage_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  PAYPAL_ORDER_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  PAYPAL_ORDER_CAPTURED: {
    direction: "inflow",
    category: "usage_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  PAYPAL_CAPTURE_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  ADYEN_SESSION_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  ADYEN_PAYMENT_AUTHORIZED: {
    direction: "inflow",
    category: "usage_revenue",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  ADYEN_PAYMENT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  ADYEN_WEBHOOK_PROCESSED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  CONNECT_ACCOUNT_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "creator",
  },
  PAYOUT_INITIATED: {
    direction: "outflow",
    category: "creator_payout",
    taxTreatment: "expense",
    counterpartyKind: "creator",
  },
  PAYOUT_PAID: {
    direction: "outflow",
    category: "creator_payout",
    taxTreatment: "expense",
    counterpartyKind: "creator",
  },
  PAYOUT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "creator",
  },
  RAMP_FUND_CREATED: {
    direction: "internal",
    category: "agent_spend",
    taxTreatment: "expense",
    counterpartyKind: "treasury",
  },
  RAMP_VIRTUAL_CARD_ISSUED: {
    direction: "internal",
    category: "agent_spend",
    taxTreatment: "expense",
    counterpartyKind: "vendor",
  },
  RAMP_AGENT_CARD_ISSUED: {
    direction: "internal",
    category: "agent_spend",
    taxTreatment: "expense",
    counterpartyKind: "agent",
  },
  OFFRAMP_SESSION_CREATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "unknown",
  },
  OFFRAMP_UPDATED: {
    direction: "internal",
    category: "other",
    taxTreatment: "unknown",
  },
  OFFRAMP_COMPLETED: {
    direction: "outflow",
    category: "other",
    taxTreatment: "passthrough",
    counterpartyKind: "customer",
  },
  OFFRAMP_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  BANK_LINKED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  CREDIT_TOPUP_PENDING: {
    direction: "internal",
    category: "prepaid_liability",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  CREDIT_TOPUP_SETTLED: {
    direction: "inflow",
    category: "prepaid_liability",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  CREDIT_TOPUP_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
  },
  CREDIT_DEBITED: {
    direction: "internal",
    category: "prepaid_redemption",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  CREDIT_TRANSFER_SENT: {
    direction: "outflow",
    category: "peer_transfer",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  CREDIT_TRANSFER_RECEIVED: {
    direction: "inflow",
    category: "peer_transfer",
    taxTreatment: "non_taxable",
    counterpartyKind: "customer",
  },
  CREDIT_HELD: {
    direction: "internal",
    category: "prepaid_liability",
    taxTreatment: "non_taxable",
  },
  CREDIT_CAPTURED: {
    direction: "internal",
    category: "prepaid_redemption",
    taxTreatment: "taxable_revenue",
    counterpartyKind: "customer",
  },
  CREDIT_RELEASED: {
    direction: "internal",
    category: "prepaid_liability",
    taxTreatment: "non_taxable",
  },
  COMPENSATION_DEPOSIT_STAGED: {
    direction: "internal",
    category: "agent_compensation",
    taxTreatment: "expense",
    counterpartyKind: "agent",
  },
  COMPENSATION_DEPOSIT_CONFIRMED: {
    direction: "internal",
    category: "agent_compensation",
    taxTreatment: "expense",
    counterpartyKind: "agent",
  },
  COMPENSATION_DEPOSIT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "agent",
  },
  COMPENSATION_CASHOUT_STAGED: {
    direction: "internal",
    category: "agent_compensation",
    taxTreatment: "expense",
    counterpartyKind: "agent",
  },
  COMPENSATION_CASHOUT_COMPLETED: {
    direction: "outflow",
    category: "agent_compensation",
    taxTreatment: "expense",
    counterpartyKind: "agent",
  },
  COMPENSATION_CASHOUT_FAILED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "agent",
  },
  COMPENSATION_CANCELLED: {
    direction: "internal",
    category: "other",
    taxTreatment: "non_taxable",
    counterpartyKind: "agent",
  },
};

/** Default eventKind → accounting classification (credits top-up = liability, not revenue). */
export function classifyAccounting(
  eventKind: PaymentEventKind,
  payload: PaymentWormPayload
): PaymentAccounting {
  const base = KIND_MAP[eventKind] ?? {
    direction: "internal" as const,
    category: "other" as const,
    taxTreatment: "unknown" as const,
  };

  const counterpartyId = payload.agent_id?.trim() || undefined;
  const externalRefs: PaymentAccounting["externalRefs"] = {};
  const resource = payload.resource?.trim();
  if (resource) {
    if (eventKind === "STRIPE_INVOICE_PAID" || resource.startsWith("in_")) {
      externalRefs.stripeInvoiceId = resource;
    } else if (resource.startsWith("0x") || /^[0-9a-f]{64}$/i.test(resource)) {
      externalRefs.txHash = resource;
    } else if (eventKind.startsWith("PAYOUT_") || eventKind.startsWith("COMPENSATION_CASHOUT_")) {
      externalRefs.payoutId = resource;
    }
  }

  return {
    direction: base.direction,
    category: base.category,
    taxTreatment: base.taxTreatment,
    counterpartyId,
    counterpartyKind: base.counterpartyKind,
    externalRefs: Object.keys(externalRefs).length > 0 ? externalRefs : undefined,
  };
}

/** Resolve accounting for an entry: prefer stored enrichment, else classify from action. */
export function resolveEntryAccounting(entry: PaymentWormEntry): PaymentAccounting {
  if (entry.accounting) {
    const fallback = classifyAccounting(entry.action, entry.payload);
    return {
      ...fallback,
      ...entry.accounting,
      externalRefs: {
        ...fallback.externalRefs,
        ...entry.accounting.externalRefs,
      },
      counterpartyId: entry.accounting.counterpartyId ?? fallback.counterpartyId,
      counterpartyKind: entry.accounting.counterpartyKind ?? fallback.counterpartyKind,
    };
  }
  return classifyAccounting(entry.action, entry.payload);
}

export function entryHasMonetaryAmount(entry: PaymentWormEntry): boolean {
  const usd = entry.payload.amount_usd;
  const usdc = entry.payload.amount_usdc;
  return (
    (typeof usd === "number" && Number.isFinite(usd) && usd !== 0) ||
    (typeof usdc === "number" && Number.isFinite(usdc) && usdc !== 0)
  );
}
