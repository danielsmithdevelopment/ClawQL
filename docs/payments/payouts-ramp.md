# Creator payouts + Ramp agent cards

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**CLI:** `clawql payments payout *` · `clawql payments ramp *`

## Two complementary money-out surfaces

| Surface     | Provider               | Role                                                          |
| ----------- | ---------------------- | ------------------------------------------------------------- |
| **Payouts** | Stripe Connect Express | Platform → creator **bank** (and USDC disbursement _intents_) |
| **Ramp**    | Ramp Developer API     | **Agent virtual / agent cards** with spend controls           |

This is the money-out complement to the four agentic _ingress_ rails (x402 / MPP / ACP / AP2). It targets LiveFrame-style creator payouts and agent purchasing authority—not another micropayment protocol.

> **Note:** Ramp Business (corporate cards / Agent Cards) is distinct from consumer crypto on/off-ramp vendors (Moonpay, Transak, Ramp Network). Fiat cash-out for creators uses **Stripe Connect**. Ramp here is for **agent spend**.

## Effect services

| Service         | Tag                    | Ops                                                                  |
| --------------- | ---------------------- | -------------------------------------------------------------------- |
| `PayoutService` | `clawql/PayoutService` | Connect account, onboarding link, create payout, creator preferences |
| `RampService`   | `clawql/RampService`   | Create fund, vault virtual card, issue agent card                    |

Wired into `paymentsServicesLiveLayer()`. Discovery advertises `type: "payouts"` and `type: "ramp"` when enabled.

## Flags

| Env                                         | Purpose                                                   |
| ------------------------------------------- | --------------------------------------------------------- |
| `CLAWQL_PAYOUTS_ENABLED`                    | Enable payouts (default on when `STRIPE_SECRET_KEY` set)  |
| `CLAWQL_PAYOUTS_DRY_RUN`                    | Connect/payout without live Stripe (default when no key)  |
| `CLAWQL_PAYOUTS_RETURN_URL` / `REFRESH_URL` | Connect onboarding URLs                                   |
| `CLAWQL_RAMP_ENABLED`                       | Enable Ramp adapter                                       |
| `CLAWQL_RAMP_DRY_RUN`                       | Fund/card without live Ramp (default when no credentials) |
| `RAMP_CLIENT_ID` / `RAMP_CLIENT_SECRET`     | OAuth client credentials                                  |
| `RAMP_ENVIRONMENT`                          | `demo` (default) or `production`                          |
| `RAMP_OAUTH_SCOPES`                         | Override default funds/vault scopes                       |

## CLI

```bash
# Creator bank path (Stripe Connect)
export CLAWQL_PAYOUTS_DRY_RUN=1
clawql payments payout connect create --email creator@example.com --creator clipper-1
clawql payments payout connect link --account acct_dry_…
clawql payments payout prefer --creator clipper-1 --method bank --account acct_dry_…
clawql payments payout create --amount 25 --creator clipper-1

# USDC preference (audited intent; chain send facilitator is a follow-up)
clawql payments payout prefer --creator clipper-1 --method usdc --wallet 0x…
clawql payments payout create --amount 10 --creator clipper-1 --destination usdc

# Agent cards (Ramp)
export CLAWQL_RAMP_DRY_RUN=1
clawql payments ramp fund create --limit 500 --name "Swarm budget"
clawql payments ramp agent-card issue --user-id USER --amount 25 --agent research-1
# Live vault (PCI): pan/cvv only with --show-secrets; never written to WORM
clawql payments ramp card issue --user-id USER --limit 100 --show-secrets
```

## WORM kinds

`CONNECT_ACCOUNT_CREATED`, `PAYOUT_INITIATED`, `PAYOUT_PAID`, `PAYOUT_FAILED`,  
`RAMP_FUND_CREATED`, `RAMP_VIRTUAL_CARD_ISSUED`, `RAMP_AGENT_CARD_ISSUED`

PAN/CVV are **never** stored in the audit trail—only card id / last four / fund id.

## Follow-ups

- Live USDC transfer facilitator (Base) for `destination=usdc`
- Ramp Agent Cards native `cards:read_agentic` path when API access is granted
- Consumer off-ramp adapters (Moonpay / Transak) as a separate `OffRampService`
- Stripe Connect webhooks (`transfer.*`, `payout.*`) → settle `PAYOUT_PAID`
