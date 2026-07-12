# clawql-payments

Unified payments layer for ClawQL — Stripe billing, x402 micropayments, managed plan entitlements, and WORM-auditable payment events.

ClawQL's own managed tiers (Free / Pro / Team / Enterprise) run on this package internally. The same package is available to ClawQL users to bill their own customers via Stripe, gate MCP tools and HTTP endpoints via x402, and get a correlated payment audit trail across both rails.

## Architecture

```
clawql-payments
├── stripe/     # Subscriptions, invoices, webhooks, metered usage, customer portal
├── x402/       # Wallet setup, resource gating, proof verification, settlement reconcile
├── plans/      # ClawQL tier definitions, entitlements, usage tracking, limit enforcement
├── audit/      # Payment events → WORM (ring buffer today; durable WORM writer follow-up)
└── cli/        # `clawql payments *` command implementations
```

## CLI

```bash
# ClawQL managed billing (internal + self-hosted)
clawql payments plan show
clawql payments plan upgrade --tier team
clawql payments usage report --month 2026-07

# Stripe (user billing)

Set `STRIPE_SECRET_KEY` for live API calls. Webhook signing secret is stored locally via setup (never commit secrets).

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_PRO_PRICE_ID=price_...
export STRIPE_TEAM_PRICE_ID=price_...

clawql payments stripe setup --webhook-secret whsec_...
clawql payments stripe customer create --email user@acme.com
clawql payments stripe subscription create --customer cus_xxx --plan pro
clawql payments stripe invoice create --customer cus_xxx --amount 500

# Verify webhook signatures before processing (required before going live)
clawql payments stripe webhook verify --payload ./event.json --signature "t=...,v1=..." --process
```

Payment audit events (`STRIPE_INVOICE_PAID`, `STRIPE_PAYMENT_FAILED`, etc.) are written when verified webhooks are processed — not at invoice creation time.

# x402 micropayments
clawql payments x402 wallet setup --address 0x...
clawql payments x402 gate --resource /v1/chat/completions --price 0.001 --asset USDC
clawql payments x402 gate --tool knowledge_search --price 0.0005
clawql payments x402 verify --tx-hash 0xabc...
clawql payments x402 reconcile --date 2026-07-11

# Unified reporting
clawql payments spend report --group-by provider
clawql payments audit --correlation-id xxx
```

## Programmatic usage

```typescript
import {
  CLAWQL_PLANS,
  entitlementsFromPlan,
  checkEntitlementLimit,
  createX402Gate,
  appendPaymentWormEntry,
  buildX402PaymentReceivedEntry,
} from "clawql-payments";
```

## Config

Local state is stored under `$CLAWQL_HOME/Payments/` (default `~/.clawql/Payments/`):

- `payments.json` — tenant plan, Stripe and x402 wallet config
- `x402-gates.json` — payment-gated resources and MCP tools
- `usage.json` — metered usage counters per tenant/month

## Status

Stripe SDK integration is **live** for customers, subscriptions, invoices, billing portal, meter events (Stripe Billing Meters), and webhook signature verification. Invoice payment audit events are recorded via verified `invoice.paid` webhooks only.

x402 facilitator HTTP calls and durable WORM persistence remain follow-up work.

## Related

- x402 protocol and Cloudflare/AWS edge monetization (July 2026)
- GitHub issue #88 — payment rail discovery (`.well-known/payments.json`)
- ClawQL inference gateway metered billing (`clawql-inference`)
