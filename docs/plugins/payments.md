---
title: Payments
description: Native Stripe + x402 + MPP + AP2 + ACP + PayPal + Adyen rails, plan entitlements, WORM payment audit, accounting export and tax evidence.
slug: payments
status: shipped
package: clawql-payments
order: 10
prev: ouroboros
next: hitl-label-studio
---

# Payments (`clawql-payments`)

**Status:** Shipped (foundation + Tier 1 protocols + Adyen + Connect payouts / Ramp / off-ramp + prepaid credits + agent compensation + accounting export / tax evidence)  
**Package:** [`packages/clawql-payments`](../../packages/clawql-payments)  
**Toggle:** Always available as a library; gate rails via `CLAWQL_X402_ENFORCE`, `CLAWQL_MPP_ENABLED`, `CLAWQL_AP2_ENABLED`, `CLAWQL_ACP_ENABLED`, `CLAWQL_PAYPAL_ENABLED`, `CLAWQL_ADYEN_ENABLED`, `CLAWQL_CREDITS_ENABLED`, `CLAWQL_COMPENSATION_ENABLED`, `CLAWQL_PAYMENTS_MCP_TOOLS`, `CLAWQL_TAX_PROFILE_ENFORCE`, plan entitlements  
**Plugin:** `PaymentsX402ProxyPlugin` (`payments-x402-mcp-proxy`) for MCP tool-level x402 enforcement (+ optional AP2 mandate checks); optional payout / compensation tools via `CLAWQL_PAYMENTS_MCP_TOOLS=1`

## Positioning

ClawQL is the only Agentic Gateway with native **Stripe + x402 + MPP + AP2 + ACP** payment surfaces, **PayPal Orders**, **Adyen Checkout** (enterprise), **Connect payouts / Ramp / consumer off-ramp**, **prepaid credits**, **agent compensation**, a **WORM-audited** payment event trail, and an **accounting subledger export** for books / CPA handoff:

| Rail               | Role                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Stripe**         | Human fiat — subscriptions, invoices, Billing Meters, Shared Payment Tokens            |
| **x402**           | Per-request USDC micropayments (one chain settlement per paid call)                    |
| **MPP**            | Session-based streaming micropayments (pre-authorize once; high-frequency agent spend) |
| **AP2**            | Cryptographic Payment Mandates (authorization / non-repudiation under MCP)             |
| **ACP**            | Merchant-side agentic checkout sessions (ChatGPT Instant Checkout–style)               |
| **PayPal**         | Human wallet Orders v2 create/capture                                                  |
| **Adyen**          | Enterprise Checkout sessions, payments, HMAC-verified webhooks                         |
| **Payouts / Ramp** | Creator bank + Base USDC; Ramp agent cards; Moonpay/Transak off-ramp                   |
| **Credits**        | Prepaid ledger + ACH/FC top-up + P2P tenant transfer; sync `DeductionService`          |
| **Compensation**   | Agent deposit / cash-out with DAOS-aligned 2PC staging                                 |
| **Accounting**     | Period subledger CSV/JSON/QB/Xero; tax profile gate; year-end evidence pack            |

Operator guide: [clawql-payments](../payments/clawql-payments.md) → `/payments/clawql-payments` (includes [Accounting & tax](../payments/clawql-payments.md#accounting--tax)).

### Accounting & tax (operator quick start)

```bash
clawql payments audit verify
clawql payments accounting export --from 2026-01-01 --to 2026-12-31 --format csv
clawql payments accounting tax-evidence --tax-year 2026
clawql payments tax-profile set --party-id creator-1 --tax-form 1099nec --collected
```

Full ownership model (subledger vs GL, 1099 / W-9, no in-process e-file): [accounting-and-tax.md](../payments/accounting-and-tax.md).

## Roadmap

1. **Mollie / Razorpay** — Tier 3 regional processors when regional traction requires them

Docs-site UCP discovery remains a stub. Adyen/AP2/ACP/PayPal live when env flags are set on self-hosted `clawql-payments`.

## Related

- [Accounting & tax](../payments/accounting-and-tax.md)
- [Inference payments integration](../inference/clawql-inference.md#plan-entitlements-and-payments-clawql-payments)
- [Plugin registry](../reference/clawql-plugin-registry.md)
