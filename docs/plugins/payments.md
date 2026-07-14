---
title: Payments
description: Native Stripe + x402 + MPP agentic rails, plan entitlements, WORM payment audit. Roadmap AP2, ACP, PayPal.
slug: payments
status: shipped
package: clawql-payments
order: 10
prev: ouroboros
next: hitl-label-studio
---

# Payments (`clawql-payments`)

**Status:** Shipped (foundation)  
**Package:** [`packages/clawql-payments`](../../packages/clawql-payments)  
**Toggle:** Always available as a library; gate enforcement via `CLAWQL_X402_ENFORCE`, `CLAWQL_MPP_ENABLED`, plan entitlements  
**Plugin:** `PaymentsX402ProxyPlugin` (`payments-x402-mcp-proxy`) for MCP tool-level x402 enforcement

## Positioning

ClawQL is the only MCP gateway with native **Stripe + x402 + MPP** payment rails and a **WORM-audited** payment event trail:

| Rail       | Role                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| **Stripe** | Human fiat — subscriptions, invoices, Billing Meters, Shared Payment Tokens            |
| **x402**   | Per-request USDC micropayments (one chain settlement per paid call)                    |
| **MPP**    | Session-based streaming micropayments (pre-authorize once; high-frequency agent spend) |

Operator guide: [clawql-payments](../payments/clawql-payments.md) → `/payments/clawql-payments`.

## Roadmap (not shipped)

1. **AP2** (Google / FIDO) — cryptographic mandates; authorization layer bridged to x402
2. **ACP** (OpenAI / Stripe) — merchant-side ChatGPT commerce checkout
3. **PayPal direct** — human wallet checkout (Adyen direct = Tier 2 enterprise)

Docs-site ACP/UCP/AP2 discovery documents are stubs until those adapters land.

## Related

- [Inference payments integration](../inference/clawql-inference.md#plan-entitlements-and-payments-clawql-payments)
- [Plugin registry](../reference/clawql-plugin-registry.md)
