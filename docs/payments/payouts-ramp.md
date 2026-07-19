# Creator payouts, Ramp agent cards, and consumer off-ramp

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**CLI:** `clawql payments payout *` · `clawql payments ramp *` · `clawql payments offramp *`

## Three complementary money-out surfaces

| Surface      | Provider                      | Role                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------- |
| **Payouts**  | Stripe Connect Express + Base | Platform → creator **bank** transfers; live **USDC** ERC-20 sends |
| **Ramp**     | Ramp Developer API (Business) | **Agent virtual / agent cards** with spend controls               |
| **Off-ramp** | Moonpay / Transak (widgets)   | Creator **USDC → fiat** cash-out sessions (consumer sell flow)    |

This is the money-out complement to the four agentic _ingress_ rails (x402 / MPP / ACP / AP2). It targets LiveFrame-style creator payouts and agent purchasing authority—not another micropayment protocol.

> **Note:** Ramp Business (corporate cards / Agent Cards) is distinct from consumer crypto on/off-ramp vendors (Moonpay, Transak, “Ramp Network”). Fiat bank payouts use **Stripe Connect**. Consumer USDC→bank cash-out uses **Moonpay/Transak**. Ramp here is for **agent spend**.

## Effect services

| Service                  | Tag                             | Ops                                                                  |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| `PayoutService`          | `clawql/PayoutService`          | Connect account, onboarding link, create payout, creator preferences |
| `RampService`            | `clawql/RampService`            | Create fund, vault virtual card, issue agent card                    |
| `ConsumerOffRampService` | `clawql/ConsumerOffRampService` | Moonpay/Transak sell-session URLs (USDC → fiat)                      |

Wired into `paymentsServicesLiveLayer()`. Discovery advertises `type: "payouts"`, `type: "ramp"`, and `type: "offramp"` when enabled.

## Flags

| Env                                         | Purpose                                                   |
| ------------------------------------------- | --------------------------------------------------------- |
| `CLAWQL_PAYOUTS_ENABLED`                    | Enable payouts (default on when `STRIPE_SECRET_KEY` set)  |
| `CLAWQL_PAYOUTS_DRY_RUN`                    | Connect/bank without live Stripe (default when no key)    |
| `CLAWQL_PAYOUTS_RETURN_URL` / `REFRESH_URL` | Connect onboarding URLs                                   |
| `CLAWQL_PAYOUTS_USDC_PRIVATE_KEY`           | Hot wallet for live Base USDC sends                       |
| `CLAWQL_PAYOUTS_USDC_RPC_URL`               | RPC override (default Base / Base Sepolia public)         |
| `CLAWQL_PAYOUTS_USDC_CHAIN_ID` / `NETWORK`  | `8453` / `base` or Sepolia (`84532`, default)             |
| `CLAWQL_PAYOUTS_USDC_ASSET`                 | USDC contract override                                    |
| `CLAWQL_PAYOUTS_USDC_DRY_RUN`               | Force dry USDC send (also when no private key)            |
| `CLAWQL_RAMP_ENABLED`                       | Enable Ramp adapter                                       |
| `CLAWQL_RAMP_DRY_RUN`                       | Fund/card without live Ramp (default when no credentials) |
| `RAMP_CLIENT_ID` / `RAMP_CLIENT_SECRET`     | OAuth client credentials                                  |
| `RAMP_ENVIRONMENT`                          | `demo` (default) or `production`                          |
| `RAMP_OAUTH_SCOPES`                         | Override default funds/vault scopes                       |
| `CLAWQL_OFFRAMP_ENABLED`                    | Enable consumer off-ramp sessions                         |
| `CLAWQL_OFFRAMP_DRY_RUN`                    | Widget URL without live provider keys                     |
| `CLAWQL_OFFRAMP_PROVIDER`                   | `moonpay` (default) or `transak`                          |
| `MOONPAY_API_KEY` / `TRANSAK_API_KEY`       | Provider keys for live sell widgets                       |
| `CLAWQL_PAYMENTS_MCP_TOOLS`                 | Register MCP tools for payout / ramp / offramp            |
| `CLAWQL_PAYMENTS_MCP_REQUIRE_AP2`           | Require AP2 mandate JWT on those tools                    |

Live USDC sends optionally depend on `viem` (`optionalDependencies`).

## CLI

```bash
# Creator bank path (Stripe Connect)
export CLAWQL_PAYOUTS_DRY_RUN=1
clawql payments payout connect create --email creator@example.com --creator clipper-1
clawql payments payout connect link --account acct_dry_…
clawql payments payout prefer --creator clipper-1 --method bank --account acct_dry_…
clawql payments payout create --amount 25 --creator clipper-1

# Live Base USDC (dry without CLAWQL_PAYOUTS_USDC_PRIVATE_KEY)
clawql payments payout prefer --creator clipper-1 --method usdc --wallet 0x…
clawql payments payout create --amount 10 --creator clipper-1 --destination usdc

# Consumer USDC → fiat (Moonpay / Transak widget)
export CLAWQL_OFFRAMP_ENABLED=1 CLAWQL_OFFRAMP_DRY_RUN=1
clawql payments offramp session --amount 25 --wallet 0x… --provider moonpay

# Agent cards (Ramp Business — not consumer off-ramp)
export CLAWQL_RAMP_DRY_RUN=1
clawql payments ramp fund create --limit 500 --name "Swarm budget"
clawql payments ramp agent-card issue --user-id USER --amount 25 --agent research-1
# Live vault (PCI): pan/cvv only with --show-secrets; never written to WORM
clawql payments ramp card issue --user-id USER --limit 100 --show-secrets
```

## MCP tools

With `CLAWQL_PAYMENTS_MCP_TOOLS=1` (included in `defaultPaymentsProxyPlugins`):

| Tool                              | Action                                    |
| --------------------------------- | ----------------------------------------- |
| `payments_payout_create`          | Bank or USDC creator payout               |
| `payments_ramp_agent_card_issue`  | Issue agent-scoped Ramp card (no PAN/CVV) |
| `payments_offramp_session_create` | Moonpay/Transak sell-session URL          |

Optional `CLAWQL_PAYMENTS_MCP_REQUIRE_AP2=1` requires a `mandateJwt` argument verified via `Ap2MandateService`.

## Webhooks (Stripe Connect)

`StripeWebhookService` settles bank payouts:

- `transfer.created` → `PAYOUT_PAID` (platform→Connect transfer confirmed)
- `transfer.reversed` / reversed updates → `PAYOUT_FAILED`
- `payout.paid` / `payout.failed` → Connect account bank payout settle

Live `createPayout(destination=bank)` records `PAYOUT_INITIATED` only; paid/failed come from webhooks.

## WORM kinds

`CONNECT_ACCOUNT_CREATED`, `PAYOUT_INITIATED`, `PAYOUT_PAID`, `PAYOUT_FAILED`,  
`RAMP_FUND_CREATED`, `RAMP_VIRTUAL_CARD_ISSUED`, `RAMP_AGENT_CARD_ISSUED`,  
`OFFRAMP_SESSION_CREATED`

PAN/CVV are **never** stored in the audit trail—only card id / last four / fund id. MCP agent-card responses redact secrets the same way.

## Follow-ups

- Receipt confirmation polling for USDC (currently `submitted` after broadcast; dry-run marks `paid`)
- Ramp Agent Cards native `cards:read_agentic` path when API access is granted
- Provider webhooks for Moonpay/Transak session completion
