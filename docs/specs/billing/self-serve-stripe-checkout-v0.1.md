# Self-serve Stripe Checkout (hosted billing) — v0.1

**Status:** Spec v0.1 (implementation)  
**Package:** `clawql-payments` (+ `apps/www` CTA)  
**Related:** [stripe-products-ops §4](../../payments/stripe-products-ops.md) · [customer-provisioning-core](./customer-provisioning-core-v0.1.md) · [hybrid-billing](./hybrid-billing-v0.1.md)

## Goal

Operators, agents, and the marketing site can create a **live Stripe Checkout Session** (`mode=subscription`) for **Pro** / **Team** with CPC metadata so the existing webhook → `provisionOrg` path provisions the org. When configured, www replaces the waitlist-only CTA with a self-serve form.

## Surfaces

| Surface        | Entry                                                                                                   | Gate                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Effect         | `StripeBillingService.createCheckoutSession`                                                            | `STRIPE_SECRET_KEY` + price price id                                           |
| Promise façade | `createStripeCheckoutSession` (`checkout-session.ts`)                                                   | same                                                                           |
| CLI            | `clawql payments stripe checkout create --plan … --org-name … --email … --success-url … --cancel-url …` | same                                                                           |
| HTTP           | `POST {base}/checkout/session` (no CPC bearer)                                                          | `CLAWQL_SELF_SERVE_CHECKOUT=1` else **503**                                    |
| www            | `/signup` Pro checkout form                                                                             | `NEXT_PUBLIC_CLAWQL_SELF_SERVE_CHECKOUT=1` + `NEXT_PUBLIC_CLAWQL_CHECKOUT_API` |

## Checkout Session contract

- `mode=subscription`
- `customer_email` = owner email
- `line_items`: one Price from `resolvePriceId(plan)` (`STRIPE_PRO_PRICE_ID` / `STRIPE_TEAM_PRICE_ID`)
- `success_url` / `cancel_url` from caller
- Metadata (CPC — [stripe-products-ops §4](../../payments/stripe-products-ops.md)):

```text
clawql_provision_org=1
clawql_org_name=<orgName>
clawql_plan=pro|team
clawql_billing_mode=stripe_checkout|hybrid
clawql_owner_email=<ownerEmail>
```

Return: `{ id, url, plan, priceId }`. Redirect the browser to `url`.

## Out of scope

- Enterprise / invoice sales paths
- Credit top-up Checkout (`mode=payment`)
- Changing webhook / `provisionOrg` semantics
