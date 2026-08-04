# Cloudflare Wallets (prep)

**Status:** 🚧 Scaffold (dry-run) — handle reserved; Virtual Wallet HTTP API not public yet  
**Package:** `clawql-payments`  
**Handle:** [`clawql.cloudflare.pay`](https://cloudflare.pay) (`@clawql`) — IDENTITY · ACCOUNT & AGENT · ONE OF ONE  
**CLI:** `clawql payments cloudflare-wallet *`  
**Related:** [payouts-ramp.md](./payouts-ramp.md) · [agent-compensation.md](./agent-compensation.md) · [clawql-payments.md](./clawql-payments.md)

## Why this exists

Cloudflare Wallets announces **stable agent identity + capped delegated spend** on **x402** (stablecoin micropayments attached to HTTP). That sits next to ClawQL’s existing stack:

| ClawQL piece | Cloudflare fit |
| ------------ | -------------- |
| x402 gates / facilitator | Native payment rail |
| `RampService` agentic cards | Complementary spend (PAN vs API-key Virtual Wallet) |
| `AgentCompensationService` | Optional funding / compensation vehicle for recruits |
| `PayoutService` / offramp | Still required for bank / USDC cash-out (CF is spend-focused) |
| Ouroboros / SGDOP | Capped Virtual Wallets for recruited agents |
| MCP / `.well-known` discovery | Public `*.cloudflare.pay` identity |

**Default positioning until the API lands:** identity + light micropayment / capped-spend prep — **not** a Ramp replacement.

## Architecture

```text
                    ┌─────────────────────────────┐
                    │   Agent identity surface     │
                    │  clawql.cloudflare.pay       │
                    │  (+ agent sub-handles later) │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
   RampService              CloudflareWalletService      x402 stack
   (card rails)             (CF Virtual Wallets)         (HTTP/MCP gates)
         │                         │                         │
         └────────────┬────────────┴────────────┬────────────┘
                      ▼                         ▼
           AgentCompensationService        PayoutService / Offramp
```

Same Effect pattern as Ramp: `Context.Tag("clawql/CloudflareWalletService")` → `paymentsServicesLiveLayer` → WORM via `PaymentAuditService` → optional MCP tools behind `CLAWQL_PAYMENTS_MCP_TOOLS=1`.

## What ships now (prep)

| Capability | Behavior |
| ---------- | -------- |
| Handle resolve | Normalizes `@clawql` / `clawql` → `clawql.cloudflare.pay`; marks reserved vs unknown |
| Virtual Wallet create | Dry-run local ledger under `$CLAWQL_HOME/Payments/cloudflare-virtual-wallets.json` |
| Spend status / revoke | Local store only |
| Discovery | `.well-known/payments.json` advertises `type: "cloudflare_wallets"` when enabled |
| WORM audit | `CLOUDFLARE_HANDLE_RESOLVED`, `CLOUDFLARE_VIRTUAL_WALLET_ISSUED`, `CLOUDFLARE_VIRTUAL_WALLET_REVOKED` |
| MCP tools | `payments_cloudflare_handle_resolve`, `payments_cloudflare_virtual_wallet_create` |

Live HTTP calls fail closed until `CLOUDFLARE_WALLETS_API_BASE` is documented by Cloudflare **and** ClawQL implements the client.

## Flags

| Env | Purpose |
| --- | ------- |
| `CLAWQL_CLOUDFLARE_WALLETS=1` | Enable adapter (default **off**) |
| `CLAWQL_CLOUDFLARE_WALLETS_HANDLE` | Reserved handle (default `clawql.cloudflare.pay`) |
| `CLAWQL_CLOUDFLARE_WALLETS_DRY_RUN` | Force dry-run (default **on**) |
| `CLOUDFLARE_WALLETS_API_BASE` | Future HTTP API base (empty = not available) |
| `CLOUDFLARE_WALLETS_API_TOKEN` / `CLOUDFLARE_API_TOKEN` | Future auth |

## CLI

```bash
export CLAWQL_CLOUDFLARE_WALLETS=1

clawql payments cloudflare-wallet handle resolve
clawql payments cloudflare-wallet virtual-wallet create \
  --agent agent-recruit-1 --allowance 50 --max-tx 10 \
  --merchant https://api.example.com
clawql payments cloudflare-wallet virtual-wallet status --wallet-id cfw_dry_…
clawql payments cloudflare-wallet virtual-wallet revoke --wallet-id cfw_dry_…
```

## Effect service shape

```ts
CloudflareWalletService {
  resolveHandle({ handle? })
  createVirtualWallet({ agentId, allowanceUsd, maxTxUsd?, merchantAllowList? })
  getSpendStatus({ walletId })
  revokeVirtualWallet({ walletId })
  listVirtualWallets({ agentId? })
}
```

## Identity / MCP plug-in (next)

1. Optional `identity.cloudflarePay` on MCP server card / discovery (handle already in `payment_methods[]`).
2. Compensation staging: `preferredSpendRail: "cloudflare_virtual_wallet" | "ramp_agent_card"`.
3. When CF wallets can pay x402 challenges, settle through existing `x402FacilitatorService` — do not invent a second gate.
4. Ouroboros seed metadata may carry `cloudflareHandle` for recruited agents.

## Decision matrix

| Mode | When |
| ---- | ---- |
| **Identity + light x402** (default) | Handle reserved; no Virtual Wallet API yet |
| **Complementary spend next to Ramp** | After CF API: cards for PAN merchants; CF for API-native allow-listed spend |
| **Primary agent spend rail** | Only if CF coverage + policy knobs beat Ramp for your merchants |
