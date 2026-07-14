---
title: Payments
description: Native Stripe + x402 + MPP + AP2 + ACP + PayPal + Adyen rails, plan entitlements, WORM payment audit.
slug: payments
status: shipped
package: clawql-payments
order: 10
prev: ouroboros
next: hitl-label-studio
---

# Payments (`clawql-payments`)

**Status:** Shipped (foundation + Tier 1 protocols + Adyen enterprise)  
**Package:** [`packages/clawql-payments`](../../packages/clawql-payments)  
**Toggle:** Always available as a library; gate rails via `CLAWQL_X402_ENFORCE`, `CLAWQL_MPP_ENABLED`, `CLAWQL_AP2_ENABLED`, `CLAWQL_ACP_ENABLED`, `CLAWQL_PAYPAL_ENABLED`, `CLAWQL_ADYEN_ENABLED`, plan entitlements  
**Plugin:** `PaymentsX402ProxyPlugin` (`payments-x402-mcp-proxy`) for MCP tool-level x402 enforcement (+ optional AP2 mandate checks)

## Positioning

ClawQL is the only MCP gateway with native **Stripe + x402 + MPP + AP2 + ACP** payment surfaces, **PayPal Orders**, **Adyen Checkout** (enterprise), and a **WORM-audited** payment event trail:

| Rail       | Role                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| **Stripe** | Human fiat — subscriptions, invoices, Billing Meters, Shared Payment Tokens            |
| **x402**   | Per-request USDC micropayments (one chain settlement per paid call)                    |
| **MPP**    | Session-based streaming micropayments (pre-authorize once; high-frequency agent spend) |
| **AP2**    | Cryptographic Payment Mandates (authorization / non-repudiation under MCP)             |
| **ACP**    | Merchant-side agentic checkout sessions (ChatGPT Instant Checkout–style)               |
| **PayPal** | Human wallet Orders v2 create/capture                                                  |
| **Adyen**  | Enterprise Checkout sessions, payments, HMAC-verified webhooks                         |

Operator guide: [clawql-payments](../payments/clawql-payments.md) → `/payments/clawql-payments`.

## Roadmap

1. **Mollie / Razorpay** — Tier 3 regional processors when regional traction requires them

Docs-site UCP discovery remains a stub. Adyen/AP2/ACP/PayPal live when env flags are set on self-hosted `clawql-payments`.

## Related

- [Inference payments integration](../inference/clawql-inference.md#plan-entitlements-and-payments-clawql-payments)
- [Plugin registry](../reference/clawql-plugin-registry.md)
