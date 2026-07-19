# Agent compensation & credits (SGDOP-ready)

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**Service:** `AgentCompensationService`  
**CLI:** `clawql payments compensation *`

## Why this exists

Ouroboros / DAOS will use **SGDOP** to detect directional blind spots and recruit diverse agents. Those agents need to be **paid for covering the gap**, then **cash out**.

This layer sits on top of the Jonah money-out rails (PR #713):

| Need                        | Mechanism                                         |
| --------------------------- | ------------------------------------------------- |
| Deposit credits / funds     | Staged `deposit` → confirm (DAOS 2PC)             |
| Hold balance                | Agent ledger (`creditsUsd` + `fundsUsd`)          |
| Cash out                    | Staged `cashout` → `PayoutService` (bank / USDC)  |
| Agent spend (separate)      | Ramp agent cards — not compensation               |
| Future SGDOP recruitment id | `recruitmentId` / `correlationId` on stage + WORM |

## Credits vs funds

| Asset       | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| **credits** | Internal swarm budget units (default 1 credit = $1 at cash-out) |
| **funds**   | Treasury-backed USD already allocated to the agent              |

Cash-out converts credits at `CLAWQL_COMPENSATION_CREDIT_USD_RATE` (default `1`).

## Two-phase commit (DAOS-aligned)

Ouroboros PEP / NATS `PENDING_ACTIONS` is not shipped yet. Payments implements a **file-backed** equivalent under `Payments/pending-actions/` that mirrors the coordination-layer contract:

1. **Stage** (inert) → `action_id` + `confirmation_code` + `approval_url`
2. **Approve view** (GET-safe) → returns `confirm_url` / `cancel_url` (no side effects)
3. **Confirm** (sole execute) → ledger credit/debit + optional `PayoutService`
4. **Cancel** (GET-safe) → marks cancelled

High-impact tool names:

- `payments_compensation_deposit`
- `payments_compensation_cashout`

Also classified financial (for future PEP): `payments_payout_create`, `payments_ramp_agent_card_issue`, `transfer_funds`, etc. See `HIGH_IMPACT_PAYMENT_TOOLS`.

## Effect API

```ts
AgentCompensationService
  getAccount(agentId)
  setPreference({ agentId, cashoutMethod, connectAccountId, usdcWallet })
  stageDeposit({ agentId, amountUsd, asset, reason, recruitmentId })
  stageCashout({ agentId, amountUsd, source, destination })
  approve({ actionId, code })   // inert
  confirm({ actionId, code })   // execute
  cancel({ actionId, code })
  depositDirect(...)            // only if CLAWQL_COMPENSATION_DIRECT=1
```

## CLI

```bash
# Recruit compensation (stage → confirm)
clawql payments compensation deposit \
  --agent agent-diversity-1 --amount 50 --asset credits \
  --reason sgdop_recruit --recruitment-id blindspot-azimuth-9

clawql payments compensation approve --action-id … --code …
clawql payments compensation confirm --action-id … --code …

# Or stage+confirm in one trusted operator step:
clawql payments compensation deposit --agent a1 --amount 50 --confirm

# Cash out to bank (reuses PayoutService dry-run without Stripe key)
clawql payments compensation cashout \
  --agent a1 --amount 20 --source credits --destination bank \
  --account acct_dry_… --confirm

clawql payments compensation balance --agent a1
```

## MCP tools

With `CLAWQL_PAYMENTS_MCP_TOOLS=1`:

| Tool                            | Behavior                          |
| ------------------------------- | --------------------------------- |
| `payments_compensation_deposit` | **Stage only** — returns approval |
| `payments_compensation_cashout` | **Stage only**                    |
| `payments_compensation_confirm` | Execute staged action             |

## WORM

`COMPENSATION_STAGED`, `COMPENSATION_DEPOSITED`,  
`COMPENSATION_CASHOUT_REQUESTED`, `COMPENSATION_CASHOUT_COMPLETED`,  
`COMPENSATION_CANCELLED`

## Flags

| Env                                   | Purpose                                          |
| ------------------------------------- | ------------------------------------------------ |
| `CLAWQL_COMPENSATION_ENABLED`         | Default on                                       |
| `CLAWQL_COMPENSATION_DIRECT`          | Allow non-2PC deposit (tests/operators)          |
| `CLAWQL_COMPENSATION_ACTION_TTL_SEC`  | Pending TTL (default 7200)                       |
| `CLAWQL_COMPENSATION_APPROVAL_BASE`   | HATEOAS base (or `CLAWQL_OUROBOROS_GATEWAY_URL`) |
| `CLAWQL_COMPENSATION_CREDIT_USD_RATE` | Credits → USD at cash-out (default 1)            |

## Future: SGDOP / Coordinator

When the strategic Coordinator ships:

1. SGDOP detects blind spot → selects diverse agents (`w_i`, Diversity Dividends).
2. Coordinator calls `payments_compensation_deposit` with `reason=sgdop_recruit` + `recruitmentId`.
3. Operator/agent confirms via 2PC (or PEP when P0-B lands — swap file store for NATS KV).
4. Agent works → later `cashout` through existing Connect / USDC / off-ramp rails.

See [Ouroboros coordination layer](../ouroboros/daos-coordination-layer-specification.md) §1.2 and [payouts-ramp.md](./payouts-ramp.md).
