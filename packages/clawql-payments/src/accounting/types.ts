/** Accounting enrichment attached to payment WORM entries (optional / backward compatible). */

export type AccountingDirection = "inflow" | "outflow" | "internal";

export type AccountingCategory =
  | "saas_revenue"
  | "usage_revenue"
  | "micropayment_revenue"
  | "prepaid_liability"
  | "prepaid_redemption"
  | "creator_payout"
  | "agent_compensation"
  | "agent_spend"
  | "fx_or_network_fee"
  | "other";

export type TaxTreatment =
  "taxable_revenue" | "passthrough" | "expense" | "non_taxable" | "unknown";

export type AccountingCounterpartyKind = "customer" | "creator" | "agent" | "vendor" | "treasury";

export type PaymentAccounting = {
  direction: AccountingDirection;
  category: AccountingCategory;
  taxTreatment?: TaxTreatment;
  counterpartyId?: string;
  counterpartyKind?: AccountingCounterpartyKind;
  externalRefs?: {
    stripeInvoiceId?: string;
    txHash?: string;
    payoutId?: string;
  };
};

/** Customer-owned chart-of-accounts override (`Payments/accounting-map.json`). */
export type AccountingMapFile = {
  /** Map `AccountingCategory` → GL account code (e.g. "4000"). */
  categories?: Partial<Record<AccountingCategory, string>>;
  /** Optional human labels for codes. */
  labels?: Record<string, string>;
};

export type AccountingExportFormat = "csv" | "json" | "qb-csv" | "xero-csv";

export type AccountingExportRow = {
  date: string;
  eventKind: string;
  category: AccountingCategory;
  direction: AccountingDirection;
  taxTreatment: TaxTreatment;
  amount: number;
  currency: "USD" | "USDC";
  tenantId: string;
  counterpartyId: string;
  counterpartyKind: string;
  correlationId: string;
  provider: string;
  resource: string;
  glCode: string;
  summary: string;
};

export type AccountingExportResult = {
  from: string;
  to: string;
  format: AccountingExportFormat;
  rowCount: number;
  totalUsd: number;
  totalUsdc: number;
  rows: AccountingExportRow[];
  verifyOk: boolean;
};

/** Tax form classification for payout counterparties — never includes SSN/ITIN. */
export type TaxFormKind = "1099nec" | "none" | "unknown";

export type TaxProfile = {
  readonly partyId: string;
  readonly taxForm: TaxFormKind;
  /** Opaque vendor/vault id — never a raw tax ID. */
  readonly taxProfileRef?: string;
  /** W-9 / W-8 collected (PII lives outside payment WORM). */
  readonly collected: boolean;
  readonly updatedAt: string;
  readonly note?: string;
};

export type TaxEvidenceRow = {
  date: string;
  eventKind: string;
  partyId: string;
  amount: number;
  currency: "USD" | "USDC";
  paymentMethod: string;
  resource: string;
  correlationId: string;
  taxForm: TaxFormKind;
  taxProfileCollected: boolean;
  taxProfileRef: string;
};

export type TaxEvidencePack = {
  taxYear: number;
  generatedAt: string;
  rowCount: number;
  totalUsd: number;
  totalUsdc: number;
  rows: TaxEvidenceRow[];
  disclaimer: string;
};
