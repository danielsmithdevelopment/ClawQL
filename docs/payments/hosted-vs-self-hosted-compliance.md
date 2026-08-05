# Hosted vs self-hosted payments — compliance posture

**Not legal advice.** ClawQL is not a bank or licensed money transmitter. This document describes how the product is **intended to be operated** so marketing and managed hosting stay aligned with a Stripe-mediated SaaS model plus **closed-loop platform credits**.

## Managed / hosted ClawQL (clawql.com SaaS)

| Allowed | Not offered on managed |
| --- | --- |
| Stripe subscriptions, invoices, and platform fees for ClawQL plans | Cross-company / public **Venmo-like P2P** |
| Closed-loop **company credit pools** funded via Stripe | Agent compensation deposit / cash-out between arbitrary agents |
| Role budgets (e.g. intern $10 / employee $20 / senior $50) and CFO top-ups | Credits that convert to cash or leave the platform |
| Employee ↔ employee credit transfer **inside the same company org** | General-purpose peer payments outside an org |
| Credits redeemable **only for ClawQL services** (inference / gateway / IDP) | |

Set `CLAWQL_MANAGED_HOSTING=1` on managed fleets. That **forces off** cross-tenant Venmo P2P (`CLAWQL_CREDITS_P2P_ENABLED`) and agent compensation. **Org credits** remain available when `CLAWQL_CREDITS_ENABLED=1` (see [org-credits.md](./org-credits.md)).

## Self-hosted operators

Cross-tenant P2P and agent compensation ship in the package for operators under **their** compliance program:

```bash
export CLAWQL_CREDITS_ENABLED=1
export CLAWQL_CREDITS_P2P_ENABLED=1          # cross-tenant only — not for managed SaaS
export CLAWQL_COMPENSATION_ENABLED=1        # agent deposit / cash-out
```

Within-company org transfers do **not** require `CLAWQL_CREDITS_P2P_ENABLED`.

## Product framing (docs + website)

> ClawQL ships a full payments stack. **Managed hosting** uses Stripe for platform fees and optional **closed-loop company credits** (role budgets, CFO top-ups, within-org transfers redeemable only for ClawQL services). Cross-tenant peer payments and agent compensation are **self-hosted opt-in** under the operator’s compliance framework.

Avoid claiming ClawQL is a consumer payments network, FDIC-insured balances, or a licensed money transmitter.

## Credits are not bank deposits

Prepaid / org credits are software ledger entries for ClawQL services. They are **not** FDIC insured and are **not** a bank account.

## Related

- [`org-credits.md`](./org-credits.md) — company pool + role allocation engine  
- [`clawql-payments.md`](./clawql-payments.md) — architecture and setup  
- [`p2p-consumer-roadmap.md`](./p2p-consumer-roadmap.md) — cross-tenant P2P (self-hosted)  
- [`agent-compensation.md`](./agent-compensation.md) — self-hosted agent rails  
- [`credits-ach.md`](./credits-ach.md) — funding via Stripe FC/ACH  
