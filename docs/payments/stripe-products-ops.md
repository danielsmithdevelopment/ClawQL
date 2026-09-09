# Stripe Products / Prices ops (CPC hybrid billing)

**Audience:** Operators enabling live self-serve Checkout + metered overage  
**Specs:** [hybrid-billing-v0.1](../specs/billing/hybrid-billing-v0.1.md) · [customer-provisioning-core](./customer-provisioning-core.md)  
**Code:** `ClawqlPlanId` / `CLAWQL_PLANS` in [`packages/clawql-payments/src/plans/tiers.ts`](../../packages/clawql-payments/src/plans/tiers.ts)

This is a **live-billing blocker**, not a schema blocker. CPC `provisionOrg` and unit tests work with fake Stripe ids; Checkout and meter reporting cannot go live until this checklist is done.

---

## 1. Products + recurring Prices (subscription rail)

Create Stripe **Products** with **recurring Prices** (monthly / optional annual):

| Plan (`ClawqlPlanId`) | Product (suggested name) | Env mapping                      |
| --------------------- | ------------------------ | -------------------------------- |
| `free`                | —                        | No Price                         |
| `pro`                 | ClawQL Pro               | `STRIPE_PRO_PRICE_ID`            |
| `team`                | ClawQL Team              | `STRIPE_TEAM_PRICE_ID`           |
| `enterprise`          | Negotiated / invoice     | Usually no public Checkout Price |

Prefer **Billing Subscriptions** (Checkout `mode=subscription` or Customer Portal), not one-time Checkout as the long-term source of truth for the tier.

Tier grants **included quota** from `CLAWQL_PLANS` (inference calls, seats, etc.). Do **not** Stripe-meter the included amount.

---

## 2. Metered overage Price

1. Create a Stripe **Billing Meter** (e.g. event name `clawql_inference_overage`).
2. Attach a **metered Price** as a subscription add-on (or per-tier).
3. Set Node env:
   - `STRIPE_METER_EVENT_NAME=<meter event name>`
   - `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1` when ready to emit
4. CPC `reportUsageToStripe` / `clawql payments org report-usage` reports **overage only**.
5. `billingMode: credits_only` **never** calls the meter API.

---

## 3. Credit top-up Prices (prepaid rail)

One-time Prices for denominations (e.g. $20 / $100 / $500):

- Checkout `mode=payment` with metadata aligned to existing top-up settle (`clawql_credit_topup` / amount cents — see [credits-ach](./credits-ach.md)).
- After payment succeeds, **ledger** is source of truth (`CreditsLedgerService`); Stripe Customer Balance is not used for per-call debits.

---

## 4. Checkout Session metadata (CPC)

When creating Checkout for self-serve org provision, set:

```text
clawql_provision_org=1
clawql_org_name=<Company>
clawql_plan=pro|team
clawql_billing_mode=stripe_checkout|hybrid|credits_only
clawql_owner_email=<optional if session collects email>
```

See [customer-provisioning-core.md](./customer-provisioning-core.md) for the full key table.

---

## 5. Webhook endpoints

| Endpoint                                       | Events                                          | Responsibility                                          |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Cloudflare gateway `POST /webhooks/stripe`     | `checkout.session.completed`, `invoice.paid`, … | D1 tenant + edge token; optional POST to Node CPC URL   |
| Node payments webhook / CLI verify `--process` | same + credit top-up PIs                        | `provisionOrg` when CPC metadata present; ledger settle |

Signing secrets: `STRIPE_WEBHOOK_SECRET` (Worker) and `clawql payments stripe setup --webhook-secret` (Node `payments.json`). Prefer **raw body** verification.

---

## 6. Customer Portal

Use existing `StripeBillingService` patterns for upgrade / cancel. Map Price ids → plan ids explicitly; do not assume gateway tier strings equal `ClawqlPlanId`.

---

## 7. Smoke checklist

1. Test-mode Checkout with CPC metadata → Node or CF handoff creates org in `org-credits.json`.
2. Org has `billingMode`, `planId`, `stripeCustomerId`.
3. Default API key issued once (Node path); D1 token remains edge-only.
4. With meter flag on, `org report-usage --overage 1` writes `USAGE_REPORTED_TO_BILLING` and a Stripe meter event.
5. Credits top-up still settles into ledger without meter events.

---

## Related

- [customer-provisioning-core.md](./customer-provisioning-core.md)
- [hybrid-billing-v0.1.md](../specs/billing/hybrid-billing-v0.1.md)
- [clawql-payments.md](./clawql-payments.md) — Stripe CLI / env tables
