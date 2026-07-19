# Agent compensation & credits (SGDOP-ready)

**Status:** Tier-1 scaffold (July 2026)  
**Package:** `clawql-payments`  
**Service:** `AgentCompensationService`  
**CLI:** `clawql payments compensation *`

## Why this exists

Ouroboros / DAOS will use **SGDOP** to detect directional blind spots and recruit diverse agents. Those agents need to be **paid for covering the gap**, then **cash out**.

This layer sits on top of the Jonah money-out rails (PR #713):

| Need                        | Mechanism                                       |
| --------------------------- | ----------------------------------------------- |
| Deposit credits / funds     | Staged deposit → confirm (DAOS 2PC)             |
| Hold balance                | Agent ledger (`creditsUsd` + `fundsUsd`)        |
| Cash out                    | Staged cash-out → `PayoutService` (bank / USDC) |
| Agent spend (separate)      | Ramp agent cards — not compensation             |
| Future SGDOP recruitment id | `recruitmentId` / `reason` on stage + WORM      |

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

When PEP + NATS KV land (build plan P0-B), swap the store behind the same stage/approve/confirm/cancel interface.

## WORM event schema

| Event                            | When                       | Key payload fields                                                 |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| `COMPENSATION_DEPOSIT_STAGED`    | `stageDeposit`             | `amount_usd`, `agent_id`, `plan`=asset, `reason`, `recruitment_id` |
| `COMPENSATION_DEPOSIT_CONFIRMED` | deposit `confirm` / direct | same + ledger applied                                              |
| `COMPENSATION_CASHOUT_STAGED`    | `stageCashout`             | `amount_usd`, `plan`=destination, `reason`=source                  |
| `COMPENSATION_CASHOUT_COMPLETED` | cash-out `confirm`         | `resource`=payoutId, destination/source                            |
| `COMPENSATION_CANCELLED`         | `cancel`                   | `resource`=actionId, optional `recruitment_id`                     |

`correlationId` prefers `recruitmentId` when present so SGDOP recruit → work → pay is one audit thread.

## MCP tools

With `CLAWQL_PAYMENTS_MCP_TOOLS=1`. Underscores are MCP-safe; logical dotted form in comments:

| Logical name                         | MCP tool name                        | Behavior         |
| ------------------------------------ | ------------------------------------ | ---------------- |
| `agent.compensation.deposit.stage`   | `agent_compensation_deposit_stage`   | Stage only       |
| `agent.compensation.deposit.confirm` | `agent_compensation_deposit_confirm` | Execute deposit  |
| `agent.compensation.cashout.stage`   | `agent_compensation_cashout_stage`   | Stage only       |
| `agent.compensation.cashout.confirm` | `agent_compensation_cashout_confirm` | Execute cash-out |

Confirm tools reject the wrong pending `kind` so deposit/cashout cannot be crossed.

Also classified financial (future PEP): `payments_payout_create`, `payments_ramp_agent_card_issue`, `transfer_funds`, etc. See `HIGH_IMPACT_PAYMENT_TOOLS`.

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

## Flags

| Env                                   | Purpose                                          |
| ------------------------------------- | ------------------------------------------------ |
| `CLAWQL_COMPENSATION_ENABLED`         | Default on                                       |
| `CLAWQL_COMPENSATION_DIRECT`          | Allow non-2PC deposit (tests/operators)          |
| `CLAWQL_COMPENSATION_ACTION_TTL_SEC`  | Pending TTL (default 7200)                       |
| `CLAWQL_COMPENSATION_APPROVAL_BASE`   | HATEOAS base (or `CLAWQL_OUROBOROS_GATEWAY_URL`) |
| `CLAWQL_COMPENSATION_CREDIT_USD_RATE` | Credits → USD at cash-out (default 1)            |

## Future: SGDOP Coordinator call sketch

When the strategic Coordinator ships (NSV / SGDOP / reputation / Diversity Dividends):

```text
1. SGDOP detects blind spot B with azimuth gap → selects agents [A1..Ak] (diversity / w_i)
2. For each recruited agent Ai:
     AgentCompensationService.stageDeposit({
       agentId: Ai,
       amountUsd: bounty(B, Ai),          // or D_i dividend share
       asset: "credits",
       reason: "sgdop_recruit",
       recruitmentId: B.id,               // blind-spot / recruitment correlation
       correlationId: session.correlationId,
     })
     → returns { actionId, confirmationCode, approvalUrl }
3. Operator / policy engine confirms (MCP agent_compensation_deposit_confirm or PEP POST)
     → COMPENSATION_DEPOSIT_CONFIRMED with recruitment_id = B.id
4. Ai executes coverage work inside evolutionary loop / ActionTypes
5. Ai (or payroll job) later:
     stageCashout → confirm → PayoutService (bank | USDC)
     → COMPENSATION_CASHOUT_COMPLETED (same correlation thread)
```

Pseudocode (Coordinator side):

```ts
for (const agent of sgdop.recruit(blindSpot)) {
  const staged =
    yield *
    compensation.stageDeposit({
      agentId: agent.id,
      amountUsd: agent.bountyUsd,
      asset: "credits",
      reason: "sgdop_recruit",
      recruitmentId: blindSpot.id,
    });
  // Surface staged.approvalUrl in Command Deck / PEP Action View
  yield * notify.operator({ approvalUrl: staged.approvalUrl, code: staged.confirmationCode });
}
```

See [Ouroboros coordination layer](../ouroboros/daos-coordination-layer-specification.md) §1.2 / §2 (SGDOP) and [payouts-ramp.md](./payouts-ramp.md).
