# Accounting & tax for `clawql-payments`

**Status:** ✅ Phases 1–3 surfaces shipped (subledger export + enrichment + tax profile gate + evidence pack) — still not a full GL or tax-filing product  
**Package:** `clawql-payments` (event source) · optional exports / verticals for books & forms  
**Related:** [clawql-payments.md](./clawql-payments.md) · [credits-ach.md](./credits-ach.md) · [agent-compensation.md](./agent-compensation.md) · [payouts-ramp.md](./payouts-ramp.md) · [banking vertical](../design/clawql-banking-vertical.md)

---

## 1. Where we are today

`clawql-payments` is strong at **money-movement audit**, and now also at **accounting-grade export**. It is still not a **general ledger / tax e-file** product.

| Capability | Status | Role |
| ---------- | ------ | ---- |
| Hash-chained payment WORM (`audit.jsonl` / Postgres) | ✅ | Forensic / ops trail with `correlation_id` |
| Spend report (`clawql payments spend report`) | ✅ | Aggregate `amount_usd` / `amount_usdc` by provider |
| Stripe invoices + `invoice.paid` → WORM | ✅ | Human SaaS AR via Stripe |
| Credits ledger + ACH top-up settle | ✅ | Prepaid liability / usage |
| Compensation ledger + 2PC cash-out | ✅ | Agent payable staging |
| x402 reconcile CLI | ✅ | Facilitator settlement check |
| Loki / SIEM export of payment events | ✅ | Security/ops, not books |
| **Accounting export** (`accounting export`) | ✅ | Period CSV/JSON/QB/Xero subledger from WORM |
| **Event → accounting enrichment** | ✅ | Auto on new WORM writes; heuristics for legacy |
| **`accounting-map.json` CoA override** | ✅ | Customer GL codes under `$CLAWQL_HOME/Payments/` |
| **Tax profile gate** (`TaxProfileService`) | ✅ | Opt-in via `CLAWQL_TAX_PROFILE_ENFORCE=1` |
| **Year-end tax evidence pack** | ✅ | Markdown + JSON evidence (not IRS PDF) |
| Double-entry journal / period close UI | ❌ | Not shipped (export + CPA / ERP) |
| Tax forms e-file (W-9 PDF, 1099 NEC filing) | ❌ | Stripe Connect Tax / CPA / banking vertical |

**Principle:** every durable money event already has (or should have) enough fields to *feed* accounting. ClawQL should not become the ERP.

---

## 2. Accounting best practices (model)

Treat the payment WORM as the **subledger of record for ClawQL-mediated flows**, with a clean handoff to the customer’s GL.

### 2.1 Event → journal line

Every append is mappable via optional `accounting` on the WORM entry (auto-filled by `buildPaymentWormEntry`):

```ts
accounting?: {
  direction: "inflow" | "outflow" | "internal";
  category:
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
  taxTreatment?: "taxable_revenue" | "passthrough" | "expense" | "non_taxable" | "unknown";
  counterpartyId?: string;
  counterpartyKind?: "customer" | "creator" | "agent" | "vendor" | "treasury";
  externalRefs?: { stripeInvoiceId?: string; txHash?: string; payoutId?: string };
}
```

Existing events remain valid without `accounting`; exporters use heuristics from `eventKind` until backfill.

### 2.2 Chart of accounts (customer-owned)

Default template (override in `$CLAWQL_HOME/Payments/accounting-map.json`):

| Category | Default GL |
| -------- | ---------- |
| `saas_revenue` | 4000 Subscription revenue |
| `usage_revenue` / `micropayment_revenue` | 4100 Usage / agent API revenue |
| `prepaid_liability` | 2500 Customer credits liability |
| `prepaid_redemption` | 4100 (usage recognition) |
| `creator_payout` | 6000 Creator COGS / payouts |
| `agent_compensation` | 6100 Agent compensation expense |
| `agent_spend` | 6200 Agent procurement / Ramp |
| Fees / other | 6300 / 6999 |

### 2.3 Recognition rules (document, don’t invent GAAP)

| Flow | Recognition sketch |
| ---- | ------------------ |
| Stripe subscription / invoice paid | Revenue when Stripe says paid |
| Credits ACH top-up settled | **Liability** ↑ (not revenue) |
| Credits deducted on inference | Liability ↓ + usage revenue |
| x402 / MPP received | Micropayment revenue when verified |
| Connect / USDC payout | Expense when `PAYOUT_PAID` |
| Compensation deposit confirmed | Agent payable / liability |
| Compensation cash-out completed | Clear payable + bank/USDC outflow |

### 2.4 Period close

1. `clawql payments audit verify` — integrity gate (export refuses if chain fails)  
2. `clawql payments accounting export --from … --to …` — subledger  
3. Customer imports into QB/Xero/NetSuite (`--format qb-csv` / `xero-csv`)  
4. Reconcile Stripe balance / USDC wallet / ACH pending separately  

---

## 3. CLI

```bash
# Subledger export (refuses if audit verify fails unless --skip-verify)
clawql payments accounting export \
  --date-from 2026-01-01 --date-to 2026-12-31 \
  --format csv \
  --output ./books/2026-subledger.csv

# QuickBooks / Xero bank-style templates
clawql payments accounting export --from 2026-01-01 --to 2026-03-31 --format qb-csv
clawql payments accounting export --from 2026-01-01 --to 2026-03-31 --format xero-csv

# Year-end evidence pack (JSON + Markdown under Payments/tax-evidence/<year>/)
clawql payments accounting tax-evidence --tax-year 2026

# Tax profile (no SSN — opaque refs only)
clawql payments tax-profile set --party-id creator-1 --tax-form 1099nec --collected \
  --tax-profile-ref vault:w9_abc
clawql payments tax-profile show --party-id creator-1

# Enforce gate on payouts (opt-in)
export CLAWQL_TAX_PROFILE_ENFORCE=1
```

---

## 4. Tax forms — what belongs where

**Do not build a full tax-filing product inside `clawql-payments`.**  
Generate **evidence packages** and **delegate e-file / forms** to Stripe Tax / Connect Tax, the customer’s CPA tools, or a banking/HR vertical.

| Form / obligation | Typical trigger in ClawQL | Owner |
| ----------------- | ------------------------- | ----- |
| **Stripe hosted invoices / receipts** | SaaS AR | Stripe via existing billing ✅ |
| **1099-NEC / 1099-K (US)** | Creator Connect payouts | Prefer **Stripe Connect Tax**; ClawQL exports evidence |
| **W-9 / W-8BEN collection** | Before taxable payouts | Onboarding / banking vertical; payments stores readiness only |
| **VAT / GST tax invoices** | EU/UK/AU B2B | Stripe Tax / Adyen; invoice refs in WORM |
| **Agent compensation tax** | SGDOP / bounty cash-out | Export cash-out ledger for CPA |
| **Crypto / USDC info reporting** | Base USDC payouts | Evidence = tx hash + amount + wallet in WORM |

### Thin surfaces in payments

1. **Tax classification tags** (`taxForm: "1099nec" | "none" | "unknown"`) in `tax-profiles.json`  
2. **Year-end export** via `accounting tax-evidence`  
3. **Block high-impact payout** when `CLAWQL_TAX_PROFILE_ENFORCE=1` and profile missing / not collected  
4. **Never store SSNs in the payment WORM** — refuse SSN-like strings in tax profile fields  

---

## 5. Package surface

| Module | Role |
| ------ | ---- |
| `src/accounting/classify.ts` | `eventKind` → category / direction / tax treatment |
| `src/accounting/export.ts` | Period filter, CSV/JSON/QB/Xero serialize, verify gate |
| `src/accounting/map.ts` | Default CoA + `accounting-map.json` |
| `src/accounting/tax-profile.ts` | File store + `TaxProfileService` Effect port |
| `src/accounting/tax-evidence.ts` | Year-end evidence pack writer |
| `src/cli/accounting.ts` | CLI runners |

---

## 6. What *not* to do

| Anti-pattern | Why |
| ------------ | --- |
| Embed QuickBooks as a hard dependency | Horizontal payments must stay rail-focused |
| Generate IRS PDF 1099s in-process without a filing partner | Legal/compliance product; high liability |
| Put SSNs / ITINs in `audit.jsonl` | Wrong store; retention and breach blast radius |
| Call credits top-ups “revenue” in exports | Prepaid liability until redeemed |
| Duplicate Stripe’s invoice PDF store | Keep Stripe as system of record for SaaS AR |

---

## 7. Relationship to banking vertical

[`clawql-banking`](../design/clawql-banking-vertical.md) may own W-9 / tax-profile collection UX next to KYC. Payments owns the **exportable subledger** and the **readiness gate**. Neither replaces the customer’s accountant.

---

## 8. Success criteria

| Metric | Signal |
| ------ | ------ |
| Completeness | Every `amount_*` WORM event appears in period export |
| Integrity | Export refused if `audit verify` fails |
| Correctness | Credits top-up classified as liability, not revenue, in default map |
| Privacy | No raw tax ID in payment WORM |
| Handoff | CPA can import CSV into a spreadsheet / QB without ClawQL UI |
