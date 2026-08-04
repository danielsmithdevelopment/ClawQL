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
**Toggle:** Always available as a library; gate rails via `CLAWQL_X402_ENFORCE`, `CLAWQL_MPP_ENABLED`, `CLAWQL_AP2_ENABLED`, `CLAWQL_ACP_ENABLED`, `CLAWQL_PAYPAL_ENABLED`, `CLAWQL_ADYEN_ENABLED`, `CLAWQL_CREDITS_ENABLED`, `CLAWQL_CREDITS_P2P_ENABLED` (default off), `CLAWQL_COMPENSATION_ENABLED` (default off), `CLAWQL_MANAGED_HOSTING`, `CLAWQL_PAYMENTS_MCP_TOOLS`, `CLAWQL_TAX_PROFILE_ENFORCE`, plan entitlements  
**Plugin:** `PaymentsX402ProxyPlugin` (`payments-x402-mcp-proxy`) for MCP tool-level x402 enforcement (+ optional AP2 mandate checks); optional payout / compensation tools via `CLAWQL_PAYMENTS_MCP_TOOLS=1`

## Positioning

**Read first:** [hosted vs self-hosted compliance](../payments/hosted-vs-self-hosted-compliance.md). Managed hosting uses Stripe for **platform fees** and optional **closed-loop company credits** ([org-credits](../payments/org-credits.md)). **Cross-tenant P2P** and **agent compensation** are self-hosted opt-in and forced off when `CLAWQL_MANAGED_HOSTING=1`.

ClawQL’s Agentic Gateway includes native **Stripe + x402 + MPP + AP2 + ACP** surfaces, **PayPal**, **Adyen**, **Connect payouts / Ramp / off-ramp**, **Cloudflare Wallets** (dry-run prep), **closed-loop prepaid credits**, optional **self-hosted P2P / agent compensation**, a **WORM-audited** payment trail, and an **accounting subledger export**:

| Rail                   | Role                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Stripe**             | Human fiat — subscriptions, invoices, Billing Meters, Shared Payment Tokens                                         |
| **x402**               | Per-request USDC micropayments (one chain settlement per paid call)                                                 |
| **MPP**                | Session-based streaming micropayments (pre-authorize once; high-frequency agent spend)                              |
| **AP2**                | Cryptographic Payment Mandates (authorization / non-repudiation under MCP)                                          |
| **ACP**                | Merchant-side agentic checkout sessions (ChatGPT Instant Checkout–style)                                            |
| **PayPal**             | Human wallet Orders v2 create/capture                                                                               |
| **Adyen**              | Enterprise Checkout sessions, payments, HMAC-verified webhooks                                                      |
| **Payouts / Ramp**     | Creator bank + Base USDC; Ramp agent cards; Moonpay/Transak off-ramp                                                |
| **Cloudflare Wallets** | `clawql.cloudflare.pay` identity + capped Virtual Wallets (dry-run prep)                                            |
| **Credits**            | Prepaid ledger + ACH/FC; **org closed-loop** budgets; **cross-tenant P2P** only with `CLAWQL_CREDITS_P2P_ENABLED=1` |
| **Compensation**       | Agent deposit / cash-out — `CLAWQL_COMPENSATION_ENABLED=1` (self-hosted)                                            |
| **Accounting**         | Period subledger CSV/JSON/QB/Xero; tax profile gate; year-end evidence pack                                         |

Operator guide: [clawql-payments](../payments/clawql-payments.md) → `/payments/clawql-payments` (includes [Accounting & tax](../payments/clawql-payments.md#accounting--tax)). Cloudflare prep: [cloudflare-wallets](../payments/cloudflare-wallets.md).

### Accounting & tax (operator quick start)

```bash
clawql payments audit verify
clawql payments accounting export --from 2026-01-01 --to 2026-12-31 --format csv
clawql payments accounting tax-evidence --tax-year 2026
clawql payments tax-profile set --party-id creator-1 --tax-form 1099nec --collected
```

Full ownership model (subledger vs GL, 1099 / W-9, no in-process e-file): [accounting-and-tax.md](../payments/accounting-and-tax.md).

## Roadmap

1. **Cloudflare Wallets live API** — swap dry-run store for Virtual Wallet HTTP client when public
2. **Mollie / Razorpay** — Tier 3 regional processors when regional traction requires them

Docs-site UCP discovery remains a stub. Adyen/AP2/ACP/PayPal live when env flags are set on self-hosted `clawql-payments`.

## Related

- [Accounting & tax](../payments/accounting-and-tax.md)
- [Inference payments integration](../inference/clawql-inference.md#plan-entitlements-and-payments-clawql-payments)
- [Plugin registry](../reference/clawql-plugin-registry.md)
