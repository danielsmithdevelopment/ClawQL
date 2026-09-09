# Hybrid billing — subscription tiers + prepaid credits

**Status:** Spec v0.1 (design)  
**Package:** `clawql-payments`  
**Related:** [customer-provisioning-core](./customer-provisioning-core-v0.1.md) · [org-credits](../../payments/org-credits.md) · [credits-ach](../../payments/credits-ach.md) · [plans/tiers](../../../packages/clawql-payments/src/plans/tiers.ts)

## Specification v0.1

Competitors ship **recurring subscription tiers** alongside **prepaid credits**. Those are structurally different Stripe primitives — configure both, then combine with `billingMode: "hybrid"`.

---

## 1. Two Stripe products (not one Price with two flags)

### Model A — Subscription tiers (Stripe Billing, recurring)

- Create **Stripe Products** with **recurring Prices** (monthly / annual).
- One Product per plan mapped to `ClawqlPlanId`: at minimum `Pro` and `Team` (env `STRIPE_PRO_PRICE_ID` / `STRIPE_TEAM_PRICE_ID` already referenced). `Free` has no Price. `Enterprise` typically uses invoice / negotiated Price, not public Checkout.
- Subscription object handles renewal — prefer **Billing Subscriptions** (started via Checkout `mode=subscription` or Customer Portal), not one-time Checkout as the long-term source of truth.
- Tier grants a **fixed included quota** (inference calls, seats, etc. from `CLAWQL_PLANS`) — not per-call Stripe metering for the included amount.
- **Overage:** attach a **metered Price** as a subscription add-on; usage beyond included quota reports via Stripe Billing meter events (`StripeMeterService` / `STRIPE_METER_EVENT_NAME`).

### Model B — Prepaid credit balance (debits as used)

- **Not** a subscription. Stripe’s role is narrow: **process the top-up charge** (Checkout `mode=payment` or PaymentIntent / ACH — see credits-ach).
- After payment succeeds, **credit your ledger** (`CreditsLedgerService` top-up / grant to org pool or member) — your DB is source of truth.
- Every inference / paid ClawQL call **debits** via existing `DeductionService` (hold → capture). Do **not** use Stripe Customer Balance for high-frequency per-call debits.
- Low-balance: threshold webhook / job → notify and optionally open a new Checkout top-up (auto-reload) or wait for manual top-up.

### Coexistence (`hybrid`)

| Usage                              | Where it settles                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Within subscription included quota | Count against plan entitlements; no credit debit (or soft-count only)                                                                                                                 |
| Beyond included quota (overage)    | Stripe metered Price on the subscription **or** debit prepaid credits — product picks one waterfall; default recommendation: **credits first, then metered overage** if credits empty |
| Credits-only SKUs / extra pack     | Ledger only                                                                                                                                                                           |

`reportUsageToStripe` only emits meter events for the overage rail. Credit debits never call Stripe metering.

---

## 2. Stripe dashboard setup (ops order)

Do this **before** enabling live self-serve Checkout / meters:

1. **Products + recurring Prices:** `Pro`, `Team` (and optional annual). Map Price ids → env (`STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`).
2. **Metered overage Price:** one metered Price (or per-tier); attach as add-on to subscription items. Configure Billing Meter + `STRIPE_METER_EVENT_NAME`.
3. **Credit top-up Prices:** one-time Prices for denominations (e.g. $20 / $100 / $500) — Checkout `mode=payment` with metadata `clawql_credit_topup` / amount cents (align with existing PI top-up metadata).
4. **Webhook endpoints:**
   - Gateway (or converged Node): `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` → `provisionOrg` / plan sync.
   - Payments: existing top-up settle (`payment_intent.succeeded` + credit metadata).
5. **Customer Portal** for upgrade / cancel (already wrapped by `StripeBillingService` patterns).

Ledger truth remains `$CLAWQL_HOME/Payments/credits-ledger.json` (or configured path) — Stripe is not the credit balance store.

---

## 3. Credit ledger (included in CPC — reuse, don’t rename)

**Yes — include ledger + debit-on-inference in the provisioning story**, as **reuse**:

| Concern                   | Existing surface                                                |
| ------------------------- | --------------------------------------------------------------- |
| Ledger entries / accounts | `CreditsLedgerService`, `CreditLedgerEntry`, `CreditLedgerKind` |
| Debit path                | `DeductionService` hold / capture / release                     |
| Org pool                  | `org:{orgId}:pool` + allocate to members                        |
| Funding                   | Stripe top-up / ACH → settle into ledger                        |

**Do not** introduce a parallel type named `CreditLedger`. Specs and APIs say `CreditsLedgerService` / credits ledger.

Debit-on-inference is already the entitlement path when credits enforcement is on; CPC requires provisioned orgs to land members on that path with clear `billingMode` waterfall (hybrid-billing §1).

---

## 4. `billingMode` matrix

| Mode              | Subscription                | Prepaid credits               | Meter overage                           |
| ----------------- | --------------------------- | ----------------------------- | --------------------------------------- |
| `stripe_checkout` | Required                    | Optional packs                | Yes                                     |
| `stripe_invoice`  | Enterprise invoice / custom | Optional                      | Optional                                |
| `hybrid`          | Required                    | Required for overage-or-packs | Yes if credits exhausted (configurable) |
| `credits_only`    | None                        | Required                      | No                                      |

---

## 5. Plan id vs gateway tier

`ClawqlPlanId` (`free|pro|team|enterprise`) and Cloudflare `GatewayTier` are **not** the same enum. Provisioning must map explicitly (e.g. `pro` → hosted gateway `teams` / `developer` — product table in implementation). Spec forbids silent string equality.

---

## 6. WORM (billing-facing)

Reuse CPC types plus existing payment audit categories for top-ups and meter reports:

- `ORG_PROVISIONED` / `ORG_PLAN_CHANGED`
- `USAGE_REPORTED_TO_BILLING`
- Existing credit top-up / debit audit rows

---

## 7. Concrete implementation slice

1. Document Stripe Product/Price/meter checklist (this §2) in runbook or ops doc link from CPC. ✅ [`stripe-products-ops.md`](../../payments/stripe-products-ops.md)
2. `billingMode` + `planId` required on provision; hybrid waterfall unit tests (credits first vs meter). ✅ (`credits_only` never meters)
3. Wire `reportUsageToStripe` to `StripeMeterService` for overage-only. ✅
4. Keep `DeductionService` as sole per-call debit; tests that credit path never calls meter API. ✅
5. Dashboard: show plan, subscription status, credit balance, top-up CTA, upgrade via Portal. Open

## Related

- [Customer provisioning core](./customer-provisioning-core-v0.1.md)
- [Operator guide](../../payments/customer-provisioning-core.md)
- [Stripe products ops](../../payments/stripe-products-ops.md)
- [org-credits](../../payments/org-credits.md)
- [deduction-service](../../payments/deduction-service.md)
- [credits-ACH](../../payments/credits-ach.md)
