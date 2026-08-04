# Creator payouts, Ramp agent cards, and consumer off-ramp

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**CLI:** `clawql payments payout *` · `clawql payments ramp *` · `clawql payments offramp *`

## Three complementary money-out surfaces

| Surface                 | Provider                      | Role                                                              |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------- |
| **Payouts**             | Stripe Connect Express + Base | Platform → creator **bank** transfers; live **USDC** ERC-20 sends |
| **Ramp**                | Ramp Developer API (Business) | **Agent virtual / agent cards** with spend controls               |
| **Cloudflare Wallets**  | Cloudflare (cloudflare.pay)   | **Identity + capped Virtual Wallets** (dry-run prep) — [cloudflare-wallets.md](./cloudflare-wallets.md) |
| **Off-ramp**            | Moonpay / Transak (widgets)   | Creator **USDC → fiat** cash-out sessions + completion webhooks   |

This is the money-out complement to the four agentic _ingress_ rails (x402 / MPP / ACP / AP2). It targets LiveFrame-style creator payouts and agent purchasing authority—not another micropayment protocol.

> **Note:** Ramp Business (corporate cards / Agent Cards) is distinct from consumer crypto on/off-ramp vendors (Moonpay, Transak, “Ramp Network”). Fiat bank payouts use **Stripe Connect**. Consumer USDC→bank cash-out uses **Moonpay/Transak**. Ramp here is for **agent spend**.

## Effect services

| Service                  | Tag                             | Ops                                                                  |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| `PayoutService`          | `clawql/PayoutService`          | Connect account, onboarding link, create payout, creator preferences |
| `RampService`            | `clawql/RampService`            | Create fund, vault virtual card, issue agent card (vault or agentic) |
| `ConsumerOffRampService` | `clawql/ConsumerOffRampService` | Moonpay/Transak sell-session URLs                                    |
| `OfframpWebhookService`  | `clawql/OfframpWebhookService`  | Verify + settle Moonpay/Transak completion webhooks                  |

Wired into `paymentsServicesLiveLayer()`. Discovery advertises `type: "payouts"`, `type: "ramp"`, and `type: "offramp"` when enabled.

## Flags

| Env                                           | Purpose                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `CLAWQL_PAYOUTS_ENABLED`                      | Enable payouts (default on when `STRIPE_SECRET_KEY` set)   |
| `CLAWQL_PAYOUTS_DRY_RUN`                      | Connect/bank without live Stripe (default when no key)     |
| `CLAWQL_PAYOUTS_RETURN_URL` / `REFRESH_URL`   | Connect onboarding URLs                                    |
| `CLAWQL_PAYOUTS_USDC_PRIVATE_KEY`             | Hot wallet for live Base USDC sends                        |
| `CLAWQL_PAYOUTS_USDC_RPC_URL`                 | RPC override (default Base / Base Sepolia public)          |
| `CLAWQL_PAYOUTS_USDC_CHAIN_ID` / `NETWORK`    | `8453` / `base` or Sepolia (`84532`, default)              |
| `CLAWQL_PAYOUTS_USDC_ASSET`                   | USDC contract override                                     |
| `CLAWQL_PAYOUTS_USDC_DRY_RUN`                 | Force dry USDC send (also when no private key)             |
| `CLAWQL_PAYOUTS_USDC_CONFIRMATIONS`           | Receipt confirmations to wait (default `1`)                |
| `CLAWQL_PAYOUTS_USDC_RECEIPT_TIMEOUT_MS`      | Receipt wait timeout (default `120000`)                    |
| `CLAWQL_PAYOUTS_USDC_SKIP_RECEIPT`            | Broadcast-only (`submitted`, no `PAYOUT_PAID` yet)         |
| `CLAWQL_RAMP_ENABLED`                         | Enable Ramp adapter                                        |
| `CLAWQL_RAMP_DRY_RUN`                         | Fund/card without live Ramp (default when no credentials)  |
| `CLAWQL_RAMP_AGENTIC`                         | Prefer native Agent Cards API (`cards:read_agentic`)       |
| `RAMP_CLIENT_ID` / `RAMP_CLIENT_SECRET`       | OAuth client credentials                                   |
| `RAMP_ENVIRONMENT`                            | `demo` (default) or `production`                           |
| `RAMP_OAUTH_SCOPES`                           | Override scopes (include `cards:read_agentic` to auto-on)  |
| `RAMP_AGENTIC_ISSUE_PATH`                     | Override POST path (default `/developer/v1/cards/agentic`) |
| `RAMP_AGENTIC_CREDS_PATH`                     | Fund creds template (`/developer/v1/funds/{fundId}/creds`) |
| `RAMP_AGENTIC_READ_PATH`                      | GET template for agentic card read                         |
| `CLAWQL_OFFRAMP_ENABLED`                      | Enable consumer off-ramp sessions                          |
| `CLAWQL_OFFRAMP_DRY_RUN`                      | Widget URL without live provider keys                      |
| `CLAWQL_OFFRAMP_PROVIDER`                     | `moonpay` (default) or `transak`                           |
| `MOONPAY_API_KEY` / `TRANSAK_API_KEY`         | Provider keys for live sell widgets                        |
| `MOONPAY_WEBHOOK_SECRET`                      | MoonPay `Moonpay-Signature-V2` signing secret              |
| `TRANSAK_ACCESS_TOKEN` / `TRANSAK_API_SECRET` | HS256 secret for Transak webhook JWT `data`                |
| `CLAWQL_PAYMENTS_MCP_TOOLS`                   | Register MCP tools for payout / ramp / offramp             |
| `CLAWQL_PAYMENTS_MCP_REQUIRE_AP2`             | Require AP2 mandate JWT on those tools                     |

Live USDC sends optionally depend on `viem` (`optionalDependencies`).

## CLI

```bash
# Creator bank path (Stripe Connect)
export CLAWQL_PAYOUTS_DRY_RUN=1
clawql payments payout connect create --email creator@example.com --creator clipper-1
clawql payments payout connect link --account acct_dry_…
clawql payments payout prefer --creator clipper-1 --method bank --account acct_dry_…
clawql payments payout create --amount 25 --creator clipper-1

# Live Base USDC (waits for receipt; dry without CLAWQL_PAYOUTS_USDC_PRIVATE_KEY)
clawql payments payout prefer --creator clipper-1 --method usdc --wallet 0x…
clawql payments payout create --amount 10 --creator clipper-1 --destination usdc

# Consumer USDC → fiat (Moonpay / Transak widget + webhook settle)
export CLAWQL_OFFRAMP_ENABLED=1 CLAWQL_OFFRAMP_DRY_RUN=1
clawql payments offramp session --amount 25 --wallet 0x… --provider moonpay
clawql payments offramp webhook --provider moonpay --payload ./moonpay.json \
  --signature "$MOONPAY_SIGNATURE_V2" --process

# Agent cards — Vault (default) or native agentic when granted
export CLAWQL_RAMP_DRY_RUN=1
clawql payments ramp fund create --limit 500 --name "Swarm budget"
clawql payments ramp agent-card issue --user-id USER --amount 25 --agent research-1
# Native agentic (cards:read_agentic):
export CLAWQL_RAMP_AGENTIC=1
clawql payments ramp agent-card issue --user-id USER --amount 25 --agent research-1
# Live vault (PCI): pan/cvv only with --show-secrets; never written to WORM
clawql payments ramp card issue --user-id USER --limit 100 --show-secrets
```

## MCP tools

With `CLAWQL_PAYMENTS_MCP_TOOLS=1` (included in `defaultPaymentsProxyPlugins`):

| Tool                               | Action                                    |
| ---------------------------------- | ----------------------------------------- |
| `payments_payout_create`           | Bank or USDC creator payout               |
| `payments_ramp_agent_card_issue`   | Issue agent-scoped Ramp card (no PAN/CVV) |
| `payments_offramp_session_create`  | Moonpay/Transak sell-session URL          |
| `payments_offramp_webhook_process` | Verify + WORM-settle provider webhooks    |

Optional `CLAWQL_PAYMENTS_MCP_REQUIRE_AP2=1` requires a `mandateJwt` argument verified via `Ap2MandateService`.

## Settlement

### USDC

Live `destination=usdc` broadcasts ERC-20 `transfer`, then `waitForTransactionReceipt` (confirmations). WORM: `PAYOUT_INITIATED` on broadcast path; `PAYOUT_PAID` only when `confirmed`. Dry-run confirms immediately. `CLAWQL_PAYOUTS_USDC_SKIP_RECEIPT=1` leaves status `submitted` without `PAYOUT_PAID`.

### Stripe Connect (bank)

`StripeWebhookService` settles:

- `transfer.created` → `PAYOUT_PAID`
- `transfer.reversed` / reversed updates → `PAYOUT_FAILED`
- `payout.paid` / `payout.failed` → Connect account bank payout settle

Live bank create records `PAYOUT_INITIATED` only.

### Consumer off-ramp

`OfframpWebhookService`:

- **MoonPay** — verify `Moonpay-Signature-V2`; `sell_transaction_*` with `status=completed` → `OFFRAMP_COMPLETED`; failed → `OFFRAMP_FAILED`; else `OFFRAMP_UPDATED`
- **Transak** — verify HS256 JWT in `data` with partner access token; `ORDER_COMPLETED` / `COMPLETED` → `OFFRAMP_COMPLETED`; failed/cancelled/expired/refunded → `OFFRAMP_FAILED`

## WORM kinds

`CONNECT_ACCOUNT_CREATED`, `PAYOUT_INITIATED`, `PAYOUT_PAID`, `PAYOUT_FAILED`,  
`RAMP_FUND_CREATED`, `RAMP_VIRTUAL_CARD_ISSUED`, `RAMP_AGENT_CARD_ISSUED`,  
`OFFRAMP_SESSION_CREATED`, `OFFRAMP_UPDATED`, `OFFRAMP_COMPLETED`, `OFFRAMP_FAILED`

PAN/CVV are **never** stored in the audit trail—only card id / last four / fund id. MCP agent-card responses redact secrets the same way.

## Ramp issuance paths

| Mode                | Flag / scope                                              | HTTP surface                                                                                                                       |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Vault** (default) | —                                                         | `POST {vault}/cards/vault` (PCI)                                                                                                   |
| **Agentic**         | `CLAWQL_RAMP_AGENTIC=1` or `cards:read_agentic` in scopes | `POST {api}/developer/v1/cards/agentic` (override via env); fund-scoped creds when merchant fields / `RAMP_AGENTIC_CREDS_PATH` set |

Paths are overridable so apps can track Ramp’s granted agentic surface without a code change.
