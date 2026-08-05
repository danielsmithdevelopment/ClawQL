# Accounting & tax for `clawql-payments`

**Status:** 📋 Design / gap analysis — not a full GL or tax-filing product  
**Package:** `clawql-payments` (event source) · optional exports / verticals for books & forms  
**Related:** [clawql-payments.md](./clawql-payments.md) · [credits-ach.md](./credits-ach.md) · [agent-compensation.md](./agent-compensation.md) · [payouts-ramp.md](./payouts-ramp.md) · [banking vertical](../design/clawql-banking-vertical.md)

---

## 1. Where we are today

`clawql-payments` is strong at **money-movement audit**, not at **general ledger / tax compliance**.

| Capability                                           | Status | Role                                                                         |
| ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Hash-chained payment WORM (`audit.jsonl` / Postgres) | ✅     | Forensic / ops trail with `correlation_id`                                   |
| Spend report (`clawql payments spend report`)        | ✅     | Aggregate `amount_usd` / `amount_usdc` by provider                           |
| Stripe invoices + `invoice.paid` → WORM              | ✅     | Human SaaS AR via Stripe                                                     |
| Credits ledger + ACH top-up settle                   | ✅     | Prepaid liability / usage                                                    |
| Compensation ledger + 2PC cash-out                   | ✅     | Agent payable staging                                                        |
| x402 reconcile CLI                                   | ✅     | Facilitator settlement check                                                 |
| Loki / SIEM export of payment events                 | ✅     | Security/ops, not books                                                      |
| Double-entry journal / chart of accounts             | ❌     | Not shipped                                                                  |
| Period close / trial balance                         | ❌     | Not shipped                                                                  |
| Tax forms (W-9, 1099-NEC, VAT invoices)              | ❌     | Not shipped (Stripe Connect Tax may cover _some_ Connect payouts externally) |
| Export to QuickBooks / Xero / NetSuite               | ❌     | Not shipped                                                                  |

**Principle:** every durable money event already has (or should have) enough fields to _feed_ accounting. ClawQL should not become the ERP.

---

## 2. Accounting best practices (target model)

Treat the payment WORM as the **subledger of record for ClawQL-mediated flows**, with a clean handoff to the customer’s GL.

### 2.1 Event → journal line

Every append should be mappable to one or more journal lines:

| Dimension                    | Why                                            |
| ---------------------------- | ---------------------------------------------- |
| `eventKind`                  | Maps to account / journal template             |
| `provider`                   | Rail (stripe, x402, ramp, payouts, credits, …) |
| `amount_usd` / `amount_usdc` | Monetary magnitude (document currency)         |
| `tenant_id`                  | Entity / cost center                           |
| `agent_id` / `creator_id`    | Counterparty (payee / agent)                   |
| `correlation_id`             | Trace to tool call / inference / document job  |
| `resource`                   | Stripe invoice id, payout id, wallet id, …     |
| Timestamp (WORM)             | Recognition date                               |

**Target enrichment (Phase 1):** optional structured fields on new events (backward compatible):

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

ClawQL ships a **default mapping template**, not a fixed CoA:

| Category                                 | Example GL (customer maps)      |
| ---------------------------------------- | ------------------------------- |
| `saas_revenue`                           | 4000 Subscription revenue       |
| `usage_revenue` / `micropayment_revenue` | 4100 Usage / agent API revenue  |
| `prepaid_liability`                      | 2500 Customer credits liability |
| `prepaid_redemption`                     | Dr 2500 / Cr 4100               |
| `creator_payout`                         | 6000 Creator COGS / payouts     |
| `agent_compensation`                     | 6100 Agent compensation expense |
| `agent_spend`                            | 6200 Agent procurement / Ramp   |
| Fees                                     | 6300 Payment processing fees    |

Operators override mapping in `$CLAWQL_HOME/Payments/accounting-map.json` (proposed).

### 2.3 Recognition rules (document, don’t invent GAAP)

| Flow                               | Recognition sketch                                    |
| ---------------------------------- | ----------------------------------------------------- |
| Stripe subscription / invoice paid | Revenue when Stripe says paid (already WORM’d)        |
| Credits ACH top-up settled         | **Liability** ↑ (not revenue)                         |
| Credits deducted on inference      | Liability ↓ + usage revenue (or contra)               |
| x402 / MPP received                | Usage / micropayment revenue when verified            |
| Connect / USDC payout              | Expense (or contra-revenue) when `PAYOUT_PAID`        |
| Compensation deposit confirmed     | Agent payable / liability                             |
| Compensation cash-out completed    | Clear payable + bank/USDC outflow                     |
| Ramp / CF Virtual Wallet issue     | Memo / commitment; expense on settlement if available |

Publish these as operator guidance; CPAs choose entity-specific treatment.

### 2.4 Period close

1. `clawql payments audit verify` — integrity gate
2. `spend report` + proposed `accounting export --from --to` — subledger
3. Customer imports into QB/Xero/NetSuite
4. Reconcile Stripe balance / USDC wallet / ACH pending separately

ClawQL owns steps 1–2. The GL owns 3–4.

---

## 3. Tax forms — what belongs where

### Decision

**Do not build a full tax-filing product inside `clawql-payments`.**  
Generate **evidence packages** and **delegate e-file / forms** to Stripe Tax / Connect Tax, the customer’s CPA tools, or a banking/HR vertical.

| Form / obligation                     | Typical trigger in ClawQL                | Owner                                                                                  |
| ------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| **Stripe hosted invoices / receipts** | SaaS AR                                  | Stripe via existing billing ✅                                                         |
| **1099-NEC / 1099-K (US)**            | Creator Connect payouts above thresholds | Prefer **Stripe Connect Tax / reporting**; ClawQL exports payout WORM as evidence      |
| **W-9 / W-8BEN collection**           | Before taxable payouts                   | Onboarding / banking vertical (KYC-adjacent) — not micropayment core                   |
| **VAT / GST tax invoices**            | EU/UK/AU B2B                             | Stripe Tax or regional processor (Adyen); ClawQL stores invoice refs in WORM           |
| **Agent compensation tax**            | SGDOP / bounty cash-out                  | Classify payee (contractor vs employee) outside ClawQL; export cash-out ledger for CPA |
| **Crypto / USDC info reporting**      | Base USDC payouts                        | Evidence = tx hash + amount + wallet in WORM; filing rules are jurisdiction-specific   |

### Thin surfaces that _do_ belong in payments

1. **Tax classification tags** on payout / compensation counterparties (`taxForm: "1099nec" | "none" | "unknown"`).
2. **Year-end export:** CSV/JSON of payouts and compensation cash-outs with payee id, amounts, dates, payment method.
3. **Block high-impact payout** if W-9/tax profile missing — same pattern as proposed `KycGatePort` (port implemented by vertical / ops).
4. **Never store SSNs in the payment WORM** — only opaque tax-profile ids or “collected=true” flags; PII in vault / Stripe / KYC vendor.

---

## 4. Proposed package surface (phased)

### Phase 0 — This document

- [x] Gap analysis vs WORM / ledgers
- [x] Accounting vs tax ownership
- [ ] Tracking issue (human)

### Phase 1 — Accounting-grade export (MVP in payments)

1. Document default `eventKind` → `accounting.category` map
2. `clawql payments accounting export --from --to [--format csv|json]`
   - One row per WORM money event (or exploded journal lines)
   - Columns: date, eventKind, category, direction, amount, currency, tenant, counterparty, correlation_id, external refs
3. Optional `accounting-map.json` for customer CoA codes
4. Tests: fixture WORM → stable CSV snapshot

**Difficulty:** low–moderate. Reuses existing audit store.

### Phase 2 — Enrichment + gates

- Populate `accounting` on new WORM writes (payout, compensation, credits, x402)
- `TaxProfilePort`: payout blocked if required tax profile missing
- QuickBooks Online / Xero CSV templates (IIF / bank-style) as documented formats

### Phase 3 — Forms & partner filing

- Prefer Stripe Connect Tax for US 1099 on Connect payouts
- Banking / payroll vertical or external CPA tool for W-9 lifecycle and e-file
- Optional Documents pack: “year-end tax evidence” PDF bundle from export + vault decisions

---

## 5. What _not_ to do

| Anti-pattern                                               | Why                                            |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Embed QuickBooks as a hard dependency                      | Horizontal payments must stay rail-focused     |
| Generate IRS PDF 1099s in-process without a filing partner | Legal/compliance product; high liability       |
| Put SSNs / ITINs in `audit.jsonl`                          | Wrong store; retention and breach blast radius |
| Call credits top-ups “revenue” in exports                  | Prepaid liability until redeemed               |
| Duplicate Stripe’s invoice PDF store                       | Keep Stripe as system of record for SaaS AR    |

---

## 6. Relationship to banking vertical

[`clawql-banking`](../design/clawql-banking-vertical.md) may own:

- W-9 / tax-profile collection UX next to KYC
- Neobank CoA presets
- Dispute / case packs that attach to journal lines

Payments owns the **exportable subledger**. Banking owns **onboarding evidence**. Neither replaces the customer’s accountant.

---

## 7. Success criteria

| Metric       | Signal                                                              |
| ------------ | ------------------------------------------------------------------- |
| Completeness | Every `amount_*` WORM event appears in period export                |
| Integrity    | Export refused if `audit verify` fails                              |
| Correctness  | Credits top-up classified as liability, not revenue, in default map |
| Privacy      | No raw tax ID in payment WORM                                       |
| Handoff      | CPA can import CSV into a spreadsheet / QB without ClawQL UI        |

---

## 8. Immediate recommendation

1. **Accept the gap** — today you have ops audit + Stripe invoices, not books/tax.
2. **Do Phase 1 export next** when prioritized (highest leverage, no ERP).
3. **Lean on Stripe Connect Tax** for creator 1099s where Connect is the payout path.
4. **Keep tax PII + form e-file out of payments**; use ports + banking/onboarding vertical.
5. Do **not** block Cloudflare Wallets / agent rails on a full GL.
