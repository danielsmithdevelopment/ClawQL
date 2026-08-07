# Agent compensation & credits (SGDOP-ready)

**Status:** Tier-1 scaffold (July 2026) — **self-hosted opt-in**  
**Package:** `clawql-payments`  
**Service:** `AgentCompensationService`  
**CLI:** `clawql payments compensation *`  
**Enable:** `CLAWQL_COMPENSATION_ENABLED=1` (default **off**; always off on managed hosting)

**Not available on ClawQL managed SaaS.** See [hosted vs self-hosted compliance](./hosted-vs-self-hosted-compliance.md).

## Why this exists

Ouroboros / DAOS will use **SGDOP** to detect directional blind spots and recruit diverse agents. Those agents need to be **paid for covering the gap**, then **cash out**. Regulated self-hosted customers bring their own compliance; ClawQL provides the software rails.

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

| Event                            | When                       | Key payload fields                                                                 |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `COMPENSATION_DEPOSIT_STAGED`    | `stageDeposit`             | `amount_usd`, `agent_id`, `plan`=asset, `reason`, `recruitment_id`                 |
| `COMPENSATION_DEPOSIT_CONFIRMED` | deposit `confirm` / direct | same + ledger applied                                                              |
| `COMPENSATION_DEPOSIT_FAILED`    | deposit `confirm` error    | `resource`=actionId, `reason`=failure (truncated), optional recruit                |
| `COMPENSATION_CASHOUT_STAGED`    | `stageCashout`             | `amount_usd`, `plan`=destination, `reason`=source                                  |
| `COMPENSATION_CASHOUT_COMPLETED` | cash-out `confirm`         | `resource`=payoutId, destination/source                                            |
| `COMPENSATION_CASHOUT_FAILED`    | cash-out `confirm` error   | `resource`=actionId, `reason`=failure; ledger re-credited if debit already applied |
| `COMPENSATION_CANCELLED`         | `cancel`                   | `resource`=actionId, optional `recruitment_id`                                     |

`correlationId` prefers `recruitmentId` when present so SGDOP recruit → work → pay is one audit thread.

Failure events are symmetric with staged/completed so SGDOP and ops can alert on confirm-time errors without scraping logs.

## MCP tools

With `CLAWQL_PAYMENTS_MCP_TOOLS=1` **and** `CLAWQL_COMPENSATION_ENABLED=1`. Underscores are MCP-safe; logical dotted form in comments.

**Safety pattern:** always call `_stage` first (safe / inert). Only call `_confirm` when ready for the irreversible ledger or payout step.

| Logical name                         | MCP tool name                        | Role                                           |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------- |
| `agent.compensation.deposit.stage`   | `agent_compensation_deposit_stage`   | **Safe entry** — stage only; no ledger credit  |
| `agent.compensation.deposit.confirm` | `agent_compensation_deposit_confirm` | **High-impact** — credits ledger               |
| `agent.compensation.cashout.stage`   | `agent_compensation_cashout_stage`   | **Safe entry** — stage only; no debit / payout |
| `agent.compensation.cashout.confirm` | `agent_compensation_cashout_confirm` | **High-impact** — debit + `PayoutService`      |

Confirm tools reject the wrong pending `kind` so deposit/cashout cannot be crossed. MCP `tools/list` descriptions spell out the same stage-vs-confirm contract.

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

## Future: SGDOP Coordinator

When the strategic Coordinator ships (NSV / SGDOP / reputation / Diversity Dividends), it should **only stage** compensation. Confirm stays with the operator / PEP / Command Deck — money never moves inside the evolutionary loop.

**Bridge doc:** [sgdop-coordinator-compensation-bridge.md](./sgdop-coordinator-compensation-bridge.md) — shipped `makeCompensationStagingPort`, `(recruitmentId, agentId, reason)` idempotency, bounty vs dividends, sequence diagram.

Short form:

```ts
import { makeCompensationStagingPort } from "clawql-payments";

// Coordinator — stage only (Promise port; confirm is not on the type)
const compensation = makeCompensationStagingPort();
const staged = await compensation.stageRecruitDeposit({
  agentId: agent.id,
  amountUsd: agent.bountyUsd,
  asset: "credits",
  reason: "sgdop_recruit",
  recruitmentId: blindSpot.id,
});
// Never call confirm from the Coordinator loop.
await notify.operator({ approvalUrl: staged.approvalUrl, code: staged.confirmationCode });
```

See also [Ouroboros coordination layer](../ouroboros/daos-coordination-layer-specification.md) §1.2 / §2, [clawql-ouroboros.md](../ouroboros/clawql-ouroboros.md), [payouts-ramp.md](./payouts-ramp.md).
