# Durability comparison board — celld · Pi Durable · Golem

**Status:** ClawQL arms measured (see [`comparison/evidence.json`](./comparison/evidence.json)); peer arms pending invite  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

---

## What is being compared (and what is not)

| Arm                       | Role                               | Notes                                                                       |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| **celld / ProgramCellDO** | ClawQL’s **own** journal substrate | Not a rival. Tiers **B** and **C** already measure program mode on celld.   |
| **Pi Durable**            | Durable **agent harness**          | Peer comparison — resume-after-crash shape differs from ClawQL.             |
| **Golem**                 | Durable **execution runtime**      | Peer comparison — mid-function resume; outbound retries + idempotency keys. |

Do **not** score celld as a third competitor next to Pi Durable and Golem. Score **ClawQL program mode on celld** vs those two runtimes/harnesses.

---

## Metric: side effects under crashes (two columns)

All arms resume after a crash. They differ on the **in-flight write**. Count both — never collapse to a single winner:

| Column                       | Meaning                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| **Duplicates**               | Same side effect applied twice (e.g. payment charged twice).       |
| **Lost / `outcome_unknown`** | Write never applied, or nobody can tell — human/operator resolves. |

**Trade-off (honest framing):** ClawQL consumes the approval **before** the write → duplicates stay at zero; an interrupted write can land in `outcome_unknown`. A retry-first system can avoid lost writes but may duplicate when the upstream is not idempotent.

Publish **both** columns on every arm.

---

## Upstream modes (required for Golem’s claim)

Run every arm against **two** mock upstreams:

1. **Idempotency-honoring** — Stripe-class: same key → one effect.
2. **No idempotency** — retries can multiply effects.

Golem’s public claim is that retries take effect once **if the service honors** idempotency keys. ClawQL’s single-use mandate does **not** depend on that. Both modes show where each guarantee comes from.

---

## Arms to run (same kill-mid-write harness)

| Arm id                 | Stack                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `clawql-file-journal`  | Tier D today (mandate / file journal)                               |
| `clawql-program-celld` | ProgramCellDO on celld (needs Tier **C** before any “wild” publish) |
| `pi-durable`           | Pi Durable alone (maintainer invite before named public board)      |
| `golem`                | Golem alone (same invite rule)                                      |
| `pi-durable+clawql`    | Pi Durable agent → ClawQL MCP tools                                 |
| `golem+clawql`         | Golem agent → ClawQL MCP tools                                      |

**Story for combinations:** durable runtime/harness keeps the agent alive; ClawQL keeps approved writes at most once — even when the upstream has **no** idempotency support.

---

## Publish timing

| Artifact                                                  | When                                                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Kill-mid-write **gateway / mandate** numbers (Tier **D**) | Ready now (CI N=50); can share privately as ClawQL-only                                                                                |
| Program-mode durability vs Pi Durable / Golem             | Tier **C** fleet peer kill measured on R2 — peer **named** boards still need maintainer invite                                         |
| Named public board with “Pi Durable” / “Golem”            | After maintainer invitation (same rule as other peer boards)                                                                           |
| De Goes / CEO outreach with numbers                       | After Tier C + private config check — [outreach order](../../gtm/golem-overlap-and-durability-honesty.md#outreach-timing-ceo--de-goes) |

---

## Implementation status

| Piece                                           | Status                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dual columns + both upstream modes              | **Shipped** — `npm run benchmark:durability-comparison`                                  |
| `clawql-file-journal` + `naive-retry` reference | **Measured** in CI                                                                       |
| `clawql-program-celld`                          | Tier B/C harnesses (isolate + fleet scripts); skipped inside Node board                  |
| Pi Durable / Golem (+ combinations)             | `pending_invite` stubs                                                                   |
| Evidence                                        | [`comparison/evidence.json`](./comparison/evidence.json) — does **not** overwrite Tier D |

### Commands

```bash
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
# Tier C when you have a conforming bucket:
CELLD_BUCKET=s3://… STREAMS_CELLD_FLEET_REQUIRED=1 npm run smoke:program-cell-fleet-kill
```
