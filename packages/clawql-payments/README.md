# clawql-payments

Unified payments layer for ClawQL — **Stripe** billing, **x402** micropayments, **MPP** session streaming, **AP2** Payment Mandates, **ACP** checkout, **PayPal** Orders, **Adyen** Checkout, managed plan entitlements, and **WORM-auditable** payment events.

**Positioning:** ClawQL’s Agentic Gateway is the only Foundational Platform surface with native **Stripe + x402 + MPP + AP2 + ACP** payments plus **PayPal** and **Adyen** fiat adapters and a correlated payment WORM trail — part of Auditable Production AI. See [`docs/payments/clawql-payments.md`](../../docs/payments/clawql-payments.md).

ClawQL's own managed tiers (Free / Pro / Team / Enterprise) run on this package internally. The same package is available to ClawQL users to bill their own customers via Stripe/PayPal/Adyen, gate MCP tools and HTTP endpoints via x402/MPP/AP2, expose ACP checkout for agent commerce, and get a correlated payment audit trail across rails.

## Architecture

```
clawql-payments
├── stripe/     # Subscriptions, invoices, webhooks, metered usage, customer portal, SPT
├── x402/       # Wallet setup, resource gating, proof verification, settlement reconcile
├── mpp/        # MPP OpenAPI discovery (`/openapi.json`), Payment 402 challenges, MCP -32042
├── ap2/        # AP2 Payment Mandates (parse/verify) + x402 gate bridge
├── acp/        # ACP checkout sessions (create/complete + Stripe SPT)
├── paypal/     # PayPal Orders v2 create/capture
├── adyen/      # Adyen Checkout sessions, payments, HMAC webhooks
├── credits/    # Prepaid ledger + Stripe Financial Connections / ACH bank top-up
├── plans/      # ClawQL tier definitions, entitlements, usage tracking, limit enforcement
├── audit/      # Payment events → hash-chained WORM (jsonl, postgres, or memory) + optional Loki export
└── cli/        # `clawql payments *` command implementations
```

## CLI

````bash
# ClawQL managed billing (internal + self-hosted)
clawql payments plan show
clawql payments plan upgrade --tier team
clawql payments usage report --month 2026-07
```

### Stripe (user billing)

Set `STRIPE_SECRET_KEY` for live API calls. Webhook signing secret is stored locally via setup (never commit secrets).

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_PRO_PRICE_ID=price_...
export STRIPE_TEAM_PRICE_ID=price_...
export STRIPE_METER_EVENT_NAME=clawql_inference_calls

clawql payments stripe setup --webhook-secret whsec_...
clawql payments stripe customer create --email user@acme.com
clawql payments stripe subscription create --customer cus_xxx --plan pro
clawql payments stripe invoice create --customer cus_xxx --amount 500
clawql payments stripe meter report --value 1 --customer cus_xxx

# Verify webhook signatures before processing (required before going live)
clawql payments stripe webhook verify --payload ./event.json --signature "t=...,v1=..." --process
````

Payment audit events (`STRIPE_INVOICE_PAID`, `STRIPE_PAYMENT_FAILED`, `X402_PAYMENT_FAILED`, etc.) are written when verified webhooks are processed or x402 enforcement fails — not at invoice creation time or when no payment proof is attached yet.

## x402 micropayments

Set `CLAWQL_X402_ENFORCE=1` on inference HTTP to return **402 Payment Required** for gated routes. Facilitator verification uses `POST /verify` against x402.org (testnet) or CDP.

```bash
export CLAWQL_X402_ENFORCE=1
export CLAWQL_X402_FACILITATOR_URL=https://x402.org/facilitator
export CLAWQL_X402_NETWORK=eip155:84532
export CLAWQL_X402_USDC_ASSET=0x036CbD53842c5426634e7929541eC2318f3dCF7e
# Optional: CLAWQL_X402_FACILITATOR_BEARER or CDP_API_KEY_ID + CDP_API_KEY_SECRET

clawql payments x402 wallet setup --address 0x...
clawql payments x402 gate --resource /v1/chat/completions --price 0.001 --asset USDC
clawql payments x402 gate --tool knowledge_search --price 0.0005
clawql payments x402 verify --payload ./payment.json --resource /v1/chat/completions
clawql payments x402 reconcile --date 2026-07-11

# Unified reporting
clawql payments spend report --group-by provider
clawql payments audit --correlation-id xxx
clawql payments audit verify
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
- `audit.jsonl` — hash-chained payment audit log (append-only WORM; default store)
- `audit.meta.json` — chain head metadata (jsonl store)

Postgres store (`CLAWQL_PAYMENTS_AUDIT_STORE=postgres`) uses `clawql_payments_audit` tables instead of local files. Optional Loki export pushes full payloads when `CLAWQL_LOKI_PUSH_URL` is set.

## Status

Stripe SDK integration is **live** for customers, subscriptions, invoices, billing portal, meter events (Stripe Billing Meters), and webhook signature verification. Inference can report meter events when `CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`. Invoice payment audit events are recorded via verified `invoice.paid` webhooks only.

x402 facilitator HTTP verification is **live** (`POST /verify` against x402.org or CDP). Inference HTTP and **native MCP tool calls** can enforce gates with `CLAWQL_X402_ENFORCE=1`.

Payment discovery is served at **`/.well-known/payments.json`** and MPP OpenAPI at **`/openapi.json`** on MCP and inference HTTP apps (dynamic from local gates/config).

**MPP** (Machine Payments Protocol): when `CLAWQL_MPP_ENABLED=1` (default when x402 or Stripe is configured), HTTP 402 responses include MPP Payment challenges alongside x402 `PAYMENT-REQUIRED`. MCP tool payment errors include `org.paymentauth/payment-required` metadata. Disable with `CLAWQL_MPP_ENABLED=0`.

Payment audit is **durable** — hash-chained append-only JSONL at `$CLAWQL_HOME/Payments/audit.jsonl` (default), optional Postgres for multi-node, and optional Loki export. Use `clawql payments audit verify` to validate chain integrity.

Full operator guide: [`docs/payments/clawql-payments.md`](../../docs/payments/clawql-payments.md).

## Related

- x402 protocol and Cloudflare/AWS edge monetization (July 2026)
- GitHub issue #88 — payment rail discovery (`.well-known/payments.json`)
- ClawQL inference gateway metered billing (`clawql-inference`)
