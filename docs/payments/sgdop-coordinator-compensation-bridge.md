# SGDOP Coordinator ↔ agent compensation bridge

**Status:** Staging port + idempotency **shipped** in `clawql-payments` (PR #714); Coordinator / SGDOP engine still roadmap  
**Depends on:** [`AgentCompensationService`](./agent-compensation.md); roadmap Coordinator ([coordination layer](../ouroboros/daos-coordination-layer-specification.md) §2)  
**Package boundary:** money staging lives in `clawql-payments`; the Coordinator (future, strategic layer) **never confirms** and never imports payout adapters  
**Import:** `import { makeCompensationStagingPort, type CompensationStagingPort } from "clawql-payments"`

## Problem

The Reference Coordinator ([coordination layer §2.8](../ouroboros/daos-coordination-layer-specification.md)) publishes escalations when NSV trips and SGDOP names a blind-spot direction, then recruits via marketplace + softmax over reputation (`w_i` / `w_floor_i`). Recruited agents need **payable work** — credits or funds for covering the gap — without putting Stripe, USDC, or ledger mutation inside the evolutionary loop or Coordinator process.

Shipped payments already provide DAOS-aligned 2PC staging. This document locks how the future Coordinator **calls** that surface.

## Invariants (non-negotiable)

| #   | Rule                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Coordinator may call **stage** tools / `stageDeposit` / `stageCashout` only.                                                                                                                                    |
| 2   | **Confirm** is operator / PEP / Command Deck (or a trusted payroll job with an explicit separate role) — never the Coordinator loop.                                                                            |
| 3   | `clawql-ouroboros` does not gain a payments dependency; Coordinator talks to payments via Effect service boundary, MCP, or HTTP HATEOAS — not by inlining `PayoutService`.                                      |
| 4   | Every recruit-related stage sets `reason: "sgdop_recruit"` (or `"diversity_dividend"` for dividend cash) and a stable `recruitmentId`.                                                                          |
| 5   | WORM `correlationId` prefers `recruitmentId` so recruit → work → pay is one audit thread.                                                                                                                       |
| 6   | Circuit Breaker **Conservative**: still allow stage (inert); surface approvals with `conservative_mode_promotion`. **Blind**: do not stage new compensation; cancel open recruit deposits when policy requires. |

## End-to-end sequence

```mermaid
sequenceDiagram
  participant Coord as SGDOP Coordinator
  participant Mkt as Agent marketplace
  participant Pay as AgentCompensationService
  participant Deck as Command Deck / PEP
  participant Agent as Recruited agent
  participant Out as PayoutService

  Coord->>Coord: NSV &lt; nsv_crit → SGDOP blind_direction
  Coord->>Mkt: recruit(blind_spot, softmax w_i / w_floor_i)
  Mkt-->>Coord: candidates [A1..Ak] + bountyUsd
  loop each Ai
    Coord->>Pay: stageDeposit (reason=sgdop_recruit, recruitmentId)
    Pay-->>Coord: actionId, confirmationCode, approvalUrl
    Note over Pay: COMPENSATION_DEPOSIT_STAGED
    Coord->>Deck: notify Action View (approvalUrl)
  end
  Deck->>Pay: confirm (POST / MCP *_confirm)
  Note over Pay: COMPENSATION_DEPOSIT_CONFIRMED or _FAILED
  Agent->>Agent: coverage work (evolutionary loop)
  opt later cash-out
    Agent->>Pay: cashout_stage (or payroll job)
    Deck->>Pay: cashout_confirm
    Pay->>Out: createPayout
    Note over Pay: CASHOUT_COMPLETED or _FAILED (+ re-credit)
  end
```

## Coordinator-facing API (shipped port)

The Coordinator should depend on a **narrow port**, not the full payments surface. Types and adapter live in `packages/clawql-payments/src/compensation/staging-port.ts` (re-exported from `clawql-payments`).

```ts
import { makeCompensationStagingPort, type CompensationStagingPort } from "clawql-payments";

const compensation: CompensationStagingPort = makeCompensationStagingPort(process.env);

const staged = await compensation.stageRecruitDeposit({
  agentId: "agent-diversity-1",
  amountUsd: 50,
  asset: "credits",
  reason: "sgdop_recruit",
  recruitmentId: "sgdop:emb-v3:1042",
  meta: { nsv: 0.12, sgdop: 4.2, bountyKind: "recruit_bounty" },
});
// staged.idempotentReplay === true on safe retries with the same key
```

`CompensationStagingPort` exposes only:

- `stageRecruitDeposit` — wraps `AgentCompensationService.stageDeposit`
- `listStagedForRecruitment` — pending deposits for Blind-mode cancel / ops

Confirm / `depositDirect` / `PayoutService` are **not** on the port.

### Idempotency (shipped)

When `recruitmentId` is set, `stageDeposit` / `stageRecruitDeposit` keys on:

```text
(recruitmentId, agentId, reason)
```

| Existing row        | Same amount + asset                                                                         | Different amount/asset      |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| `pending`           | Return prior handle (`idempotentReplay: true`); **no** second `COMPENSATION_DEPOSIT_STAGED` | Fail `Idempotent conflict…` |
| `executed`          | Fail `Deposit already executed…` (blocks double bounty)                                     | same                        |
| cancelled / expired | New stage allowed                                                                           | —                           |

Stages without `recruitmentId` (e.g. `reason: "manual"`) are not idempotent.

### Mapping onto APIs

| Port call             | Effect service                                                        | MCP tool                             |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `stageRecruitDeposit` | `AgentCompensationService.stageDeposit({ …, reason, recruitmentId })` | `agent_compensation_deposit_stage`   |
| _(forbidden)_         | `confirm` / `depositDirect`                                           | `agent_compensation_deposit_confirm` |
| Agent / payroll later | `stageCashout`                                                        | `agent_compensation_cashout_stage`   |
| Operator later        | `confirm`                                                             | `agent_compensation_cashout_confirm` |

MCP args for stage (already shipped):

```json
{
  "agentId": "agent-diversity-1",
  "amountUsd": 50,
  "asset": "credits",
  "reason": "sgdop_recruit",
  "recruitmentId": "blindspot-azimuth-9"
}
```

## Recruitment id and escalation linkage

Derive `recruitmentId` once per escalation batch and reuse it for every agent in that batch:

```text
recruitmentId = `sgdop:${embeddingModelVersion}:${escalationSeq}`
             or UUID attached when publish_escalation runs
```

Suggested extension to the escalation payload ([§2.8 `publish_escalation`](../ouroboros/daos-coordination-layer-specification.md)) — additive, optional until Coordinator ships:

```json
{
  "type": "escalation",
  "embeddingModelVersion": "…",
  "nsv": 0.12,
  "sgdop": 4.2,
  "blind_direction": [/* … */],
  "agents_considered": ["a1", "a2"],
  "recruitment_id": "sgdop:emb-v3:1042",
  "compensation": {
    "asset": "credits",
    "reason": "sgdop_recruit",
    "bounty_usd_by_agent": { "a1": 50, "a2": 40 }
  }
}
```

`ReputationUpdate.directive.blind_spot_direction` ([unified arch §6.4](../ouroboros/daos-unified-architecture-specification-v2.7.md)) stays the **exploration bias** for agents; `recruitment_id` is the **payments audit key**. Do not overload one field for both.

## Bounty vs Diversity Dividends

| Reason               | When Coordinator stages                                                   | Typical asset        | Confirm timing                                  |
| -------------------- | ------------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| `sgdop_recruit`      | Immediately after marketplace select                                      | `credits`            | Before or as agent starts coverage (ops policy) |
| `diversity_dividend` | After Evaluator verdict gates accrue `D_i` (outcome + consistency window) | `credits` or `funds` | Batch payroll / Command Deck                    |

Dividends must **not** auto-confirm. Accrual of `D_i` / `w_floor_i` is strategic-layer math; converting `D_i` → ledger dollars is a staged compensation with `reason: "diversity_dividend"` and the same `recruitmentId` (or a dividend period id) for WORM.

Cash-out is **not** a Coordinator duty. Recruited agents (or a payroll job with role `payments_ops`) call `*_cashout_stage`; humans/`PEP` confirm.

## Coordinator reference loop (stage only)

```ts
async function onEscalation(
  esc: EscalationEvent,
  marketplace: Marketplace,
  compensation: CompensationStagingPort,
  notify: CommandDeckNotify
): Promise<void> {
  if (circuitBreaker.isBlind()) return; // invariant 6

  const recruitmentId = esc.recruitment_id ?? `sgdop:${esc.embeddingModelVersion}:${esc.seq}`;

  const selected = await marketplace.recruit({
    blindSpotDirection: esc.blind_direction,
    agentsConsidered: esc.agents_considered,
    // softmax over w_i incorporating w_floor_i — coordination layer §2.7
  });

  for (const agent of selected) {
    const staged = await compensation.stageRecruitDeposit({
      agentId: agent.id,
      amountUsd: agent.bountyUsd,
      asset: "credits",
      reason: "sgdop_recruit",
      recruitmentId,
      correlationId: esc.sessionCorrelationId ?? recruitmentId,
      meta: {
        embeddingModelVersion: esc.embeddingModelVersion,
        nsv: esc.nsv,
        sgdop: esc.sgdop,
        blindSpotDirection: esc.blind_direction,
        bountyKind: "recruit_bounty",
      },
    });

    // Never: compensation.confirm(...)
    await notify.surfaceActionView({
      title: `SGDOP recruit pay — ${agent.id}`,
      approvalUrl: staged.approvalUrl,
      confirmationCode: staged.confirmationCode,
      recruitmentId,
      classification: "financial",
      conservative: circuitBreaker.isConservative(),
    });
  }
}
```

## Error / idempotency matrix

| Failure                                                     | Coordinator behavior                                                        | WORM / ledger                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `stageDeposit` fails (validation, disabled)                 | Retry with backoff or skip agent; do not invent confirm                     | No deposit events (or only provider errors outside compensation) |
| Stage succeeds, operator never confirms                     | Pending TTL → expired; agent unpaid                                         | `COMPENSATION_DEPOSIT_STAGED` only; no `_CONFIRMED`              |
| Confirm fails                                               | Retriable by operator; Coordinator does not retry confirm                   | `COMPENSATION_DEPOSIT_FAILED`                                    |
| Cash-out payout fails after debit                           | Payroll / agent retries; payments re-credits                                | `COMPENSATION_CASHOUT_FAILED`                                    |
| Duplicate stage for same `(recruitmentId, agentId, reason)` | Return prior pending handle or reject executed / conflict (see Idempotency) | At most one `COMPENSATION_DEPOSIT_STAGED` per key                |

## PEP / Command Deck alignment

From [unified arch](../ouroboros/daos-unified-architecture-specification-v2.7.md) Phase 2: tools with `governance.requires_two_phase_commit` stage into `PENDING_ACTIONS` and surface an Action View. Compensation tools are classified `"financial"` in [`high-impact.ts`](../../packages/clawql-payments/src/compensation/high-impact.ts).

Until PEP + NATS KV (build plan **P0-B**):

- Payments keeps file-backed `Payments/pending-actions/`
- `approvalUrl` / `cancelUrl` use `CLAWQL_COMPENSATION_APPROVAL_BASE` or `CLAWQL_OUROBOROS_GATEWAY_URL`
- Swap the store behind the same stage / approve / confirm / cancel interface — **no Coordinator API change**

## What must not live in `clawql-ouroboros`

- Stripe Connect / USDC / Ramp / Moonpay clients
- Ledger file mutation
- `confirm` / `depositDirect` wrappers that the evolutionary loop could call
- Auto-payout on Evaluator verdict

Allowed: consume `CompensationStagingPort` / `makeCompensationStagingPort` from `clawql-payments` (or MCP stage tools / HTTP HATEOAS). Do not re-implement ledger staging inside ouroboros.

## Env and naming cheat sheet

| Kind                | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| MCP stage (recruit) | `agent_compensation_deposit_stage`                                                                  |
| MCP confirm (ops)   | `agent_compensation_deposit_confirm`                                                                |
| Reasons             | `sgdop_recruit`, `diversity_dividend`, `task_bounty`, `manual`                                      |
| WORM                | `COMPENSATION_DEPOSIT_STAGED` / `_CONFIRMED` / `_FAILED`; cashout analogs; payload `recruitment_id` |
| Enable MCP          | `CLAWQL_PAYMENTS_MCP_TOOLS=1`                                                                       |
| Compensation        | `CLAWQL_COMPENSATION_ENABLED`, `CLAWQL_COMPENSATION_ACTION_TTL_SEC`, …                              |

## Related

- [agent-compensation.md](./agent-compensation.md) — shipped service, CLI, WORM table
- [payouts-ramp.md](./payouts-ramp.md) — money-out rails after cash-out confirm
- [clawql-ouroboros.md](../ouroboros/clawql-ouroboros.md) — compensation bridge blurb
- [daos-coordination-layer-specification.md](../ouroboros/daos-coordination-layer-specification.md) — §1.2 2PC, §2.4–2.8 SGDOP / dividends / Coordinator
- [daos-build-plan-v2.7.1.md](../ouroboros/daos-build-plan-v2.7.1.md) — P0-B PENDING_ACTIONS; P3 Coordinator / dividends
