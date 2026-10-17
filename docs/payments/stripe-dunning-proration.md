# Stripe dunning + proration runbook

**Audience:** Operators / on-call for managed ClawQL billing  
**Code:** [`packages/clawql-payments/src/stripe/dunning.ts`](../../packages/clawql-payments/src/stripe/dunning.ts) · webhook [`stripe-webhook-service.ts`](../../packages/clawql-payments/src/stripe/stripe-webhook-service.ts)  
**Related:** [stripe-products-ops.md](./stripe-products-ops.md) · [hybrid-billing-v0.1](../specs/billing/hybrid-billing-v0.1.md) · [customer-provisioning-core.md](./customer-provisioning-core.md)

This is an **operator runbook**, not a first-party collections product. Stripe **Smart Retries** own card retry schedules. ClawQL records **structured WORM audit** so finance/support can see failure stage, proration vs cycle, and subscription status transitions.

## Ownership split

| Concern                                                      | Owner                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Card retry schedule, email receipts, cancel-after-N-failures | **Stripe Billing** (Dashboard → Settings → Subscriptions and emails / Revenue recovery)                    |
| Signature-verified webhook ingest + WORM audit               | **ClawQL** Node payments webhook / CLI                                                                     |
| Customer updates payment method                              | **Stripe Customer Portal** (`createCustomerPortalSession`)                                                 |
| Soft-vs-hard entitlement cutover after `unpaid` / `canceled` | Product policy (see Grace below) — **do not** invent silent auto-suspend on first `invoice.payment_failed` |

## Events ClawQL handles

| Stripe event                                                             | ClawQL action                                                   | WORM `action`                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------ |
| `invoice.payment_failed`                                                 | Classify dunning stage + proration; append audit                | `STRIPE_PAYMENT_FAILED`        |
| `invoice.paid`                                                           | Append paid audit (includes `billing_reason` / proration flags) | `STRIPE_INVOICE_PAID`          |
| `customer.subscription.updated` → `past_due` / `unpaid` / `canceled`     | Append status signal                                            | `STRIPE_SUBSCRIPTION_PAST_DUE` |
| `customer.subscription.updated` → `active`/`trialing` after a bad status | Append recovery                                                 | `STRIPE_DUNNING_RECOVERED`     |
| `payment_intent.payment_failed` (credit top-up only)                     | Ledger `topup_failed` + audit                                   | `CREDIT_TOPUP_FAILED`          |

Classifier fields on failed invoices (in WORM `payload`):

- `dunning_stage`: `first_failure` \| `retrying` \| `exhausted`
- `billing_reason`: Stripe invoice reason (`subscription_cycle`, `subscription_update`, …)
- `is_proration`: true when reason is `subscription_update` or line items are proration
- `attempt_count`, `subscription_id`, hosted invoice URL (in `reason` when present)

## Recommended Stripe Dashboard settings

1. **Smart Retries / Revenue recovery** — enabled in live mode.
2. **Failed payment emails** — Stripe-customer emails on; support BCC optional.
3. **Subscription status after failed payment** — keep Stripe default path to `past_due` then `unpaid` / cancel per your policy (document the chosen cancel-after days in the evidence binder).
4. **Customer Portal** — allow payment-method update + invoice history.
5. **Webhook endpoints** — must include at least:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.created`
   - `checkout.session.completed`
   - (credits) `payment_intent.succeeded` / `payment_intent.payment_failed`

See [stripe-products-ops.md §5](./stripe-products-ops.md) for CF gateway vs Node CPC split.

## Grace / access policy (ClawQL)

**Default (current code):** first `invoice.payment_failed` **only** writes WORM — it does **not** suspend the org or revoke API keys. Access continues while Stripe retries.

| Stage                        | Typical meaning                    | Operator action                                                             |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `first_failure` / `retrying` | Smart Retries still scheduled      | Watch; customer can fix card via Portal                                     |
| `exhausted`                  | Stripe will not retry that invoice | Reach out; send Portal link; consider manual invoice pay                    |
| `past_due`                   | Subscription status flipped        | Same as above; tag support ticket with `subscription_id`                    |
| `unpaid` / `canceled`        | Hard stop from Stripe side         | Confirm entitlements / keys against product policy; offer win-back Checkout |

When you **do** add auto-suspend, gate it behind an explicit env flag and audit every suspension — do not couple it silently to the first failed charge.

## Proration (plan changes)

Upgrades/downgrades via Customer Portal or API create invoices with `billing_reason=subscription_update` (often with proration line items).

| Case                          | Expected ClawQL behavior                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Proration invoice **pays**    | `STRIPE_INVOICE_PAID` with `is_proration=true`                                                                            |
| Proration invoice **fails**   | `STRIPE_PAYMENT_FAILED` with `is_proration=true` — treat like any other failure; do not invent a second ledger            |
| Credits-only / hybrid prepaid | Seat/plan Stripe proration is independent of the credits ledger; do not double-charge credits for the same Stripe invoice |

**Operator tip:** when explaining a mid-cycle charge to a customer, pull the WORM row’s `billing_reason` + Stripe hosted invoice URL before guessing.

## On-call playbook (15 minutes)

1. **Confirm event** — `clawql payments audit` / Loki / payments audit JSONL for `STRIPE_PAYMENT_FAILED` or `STRIPE_SUBSCRIPTION_PAST_DUE` matching `correlationId` = Stripe `evt_…`.
2. **Open Stripe** — Customer → Subscription → Invoice; note attempt count and next retry.
3. **Customer path** — send Customer Portal session (CLI/`StripeBillingService`) to update card.
4. **If exhausted / unpaid** — decide: wait for cancel, issue courtesy credit note in Stripe, or create a fresh Checkout for win-back (CPC metadata rules still apply).
5. **Close the loop** — after successful pay, expect `STRIPE_INVOICE_PAID` and often `STRIPE_DUNNING_RECOVERED`; attach both ids to the ticket.

## Verification (eng)

```bash
cd packages/clawql-payments
npx vitest run src/stripe/dunning.test.ts src/stripe/webhook.test.ts
```

## Evidence (SOC 2 Type II)

Keep dated samples of:

- Stripe Revenue recovery / retry settings screenshot or export
- One anonymized `STRIPE_PAYMENT_FAILED` → retry → `STRIPE_INVOICE_PAID` / `STRIPE_DUNNING_RECOVERED` WORM chain
- This runbook revision date

Link from the Type II packaging checklist when filing quarterly evidence.
