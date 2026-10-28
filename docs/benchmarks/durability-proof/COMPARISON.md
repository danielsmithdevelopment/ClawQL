# Durability comparison board — celld · Pi Durable · Golem

**Status:** ClawQL arms measured; Pi Durable / Golem **live local peers** available via `DURABILITY_COMPARISON_LIVE_PEERS=1` (real `@earendil-works/pi-durable` + local `golem server`) — named public marketing boards still need maintainer invite  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

This board measures **effect** outcomes under crashes (duplicates + `outcome_unknown`), not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

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

**Trade-off (honest framing — matches De Goes / Golem 1.6):**

| System     | Favors                                | Interrupted third-party POST without keys   |
| ---------- | ------------------------------------- | ------------------------------------------- |
| **Golem**  | Completing the work                   | At least once → possible **duplicate**      |
| **ClawQL** | Never repeating a consequential write | **At most once** → may be `outcome_unknown` |

ClawQL consumes the approval **before** the write → duplicates stay at zero; an interrupted write can land in `outcome_unknown`. That unknown is explicit and limited to the in-flight window — it does not mean ClawQL “gave up”; see [why outcome unknown](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability) (check-then-decide and keys are the planned auto-resolve path). Golem retries and adds idempotency keys; when the callee honors them, effect is once. Neither is wrong — they pick opposite sides of the same distributed-systems limit.

Publish **both** columns on every arm.

---

## Upstream modes (required for Golem’s claim)

Run every arm against **two** mock upstreams — the same split he named:

1. **Idempotency-honoring** — Stripe-class: same key → one effect.
2. **No idempotency** — retries can multiply effects.

Golem’s public model: retries take effect once **if** the service honors keys; otherwise at least once. ClawQL’s single-use mandate does **not** depend on that. Both modes show where each guarantee comes from. **Planned product:** mandate-derived keys **and** spec-driven check-then-decide ([honesty](../../gtm/golem-overlap-and-durability-honesty.md#product-improvement-resolve-in-flight-unknowns-automatically-planned)) so lookup-capable / Stripe-class APIs auto-resolve instead of leaving `outcome_unknown` — still at-most-once when neither exists.

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

**Story for combinations:** Golem (or Pi Durable) keeps the agent and its tools durable; ClawQL as the tool layer keeps approved writes at most once. On APIs **without** idempotency keys, a Golem retry becomes a ClawQL **refusal** instead of a duplicate — closing the non-idempotent case in his model. On APIs **with** keys, both can converge on one effect (ClawQL keys still planned).

---

## Publish timing

| Artifact                                                  | When                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kill-mid-write **gateway / mandate** numbers (Tier **D**) | Ready now (CI N=50); can share privately as ClawQL-only                                                                                                                                                  |
| Program-mode durability vs Pi Durable / Golem             | Tier **C** fleet peer kill measured on R2 — peer **named** boards still need maintainer invite                                                                                                           |
| Named public board with “Pi Durable” / “Golem”            | After maintainer invitation (same rule as other peer boards)                                                                                                                                             |
| De Goes / CEO outreach with numbers                       | **Ready for private contact now** (stock N=1000 claim + evidence) — [outreach order](../../gtm/golem-overlap-and-durability-honesty.md#outreach-timing-ceo--de-goes); do not wait for preferred TTL tune |

---

## Public numbers vs Golem today (not a shared board)

Golem’s published figures and ClawQL’s Tier C crash board measure different things. Until both arms run the kill-mid-write harness against idempotent and non-idempotent mocks, do not declare a winner on duplicates or failover.

| What's measured               | Golem (public claims)   | ClawQL (measured)              |
| ----------------------------- | ----------------------- | ------------------------------ |
| Cold start                    | 2 ms                    | Not yet measured (celld cells) |
| Memory per unit               | 1 MB min                | ~471 KB / celld cell (earlier) |
| Density                       | 10,000+ agents / node   | Not yet measured               |
| Duplicated writes after crash | No published crash test | 0 / 1000 phased kills          |
| Failover after node crash     | No published figure     | ~12 s median (lease TTL)       |

See [STATUS — How do our numbers compare to Golem?](./STATUS.md#how-do-our-numbers-compare-to-golem).

---

## Implementation status

| Piece                                           | Status                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Dual columns + both upstream modes              | **Shipped** — `npm run benchmark:durability-comparison`                                                                                |
| `clawql-file-journal` + `naive-retry` reference | **Measured** in CI                                                                                                                     |
| `clawql-program-celld`                          | Tier B/C harnesses (isolate + fleet scripts); skipped inside Node board                                                                |
| Pi Durable / Golem (+ combinations)             | **Live peers** when `DURABILITY_COMPARISON_LIVE_PEERS=1`; otherwise `pending_invite`. Combinations still measure the ClawQL gate side. |
| Evidence                                        | [`comparison/evidence.json`](./comparison/evidence.json) — does **not** overwrite Tier D                                               |

### Live peer semantics

| Arm                 | Resume after mid-write kill                                                               | Idempotent upstream           | Non-idempotent upstream             |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| `golem`             | Live `WriteAgent` fetch mid-flight + `golem agent simulate-crash` (outbound HTTP re-sent) | 1 unique effect (key honored) | 2 unique effects (duplicate)        |
| `pi-durable`        | Live SIGKILL mid-phase, reopen SQLite, resume phase from top                              | 1 effect (`runtime.memo`)     | ≥2 effects (phase re-applies write) |
| `golem+clawql`      | ClawQL tool gate: approval consumed → refuse re-send                                      | 0 dups + unknown              | 0 dups + unknown                    |
| `pi-durable+clawql` | Same ClawQL gate                                                                          | 0 dups + unknown              | 0 dups + unknown                    |

Do **not** market these as a named public third-party board without maintainer invite. Live local measurement is real; public co-branding is separate.

### Commands

```bash
# CI default (peers stay pending_invite)
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
# Live local peers (requires golem server + Node ≥24 for the fixture; Pi Durable is an npm dep)
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_N=50 npm run benchmark:durability-comparison
# Tier C when you have a conforming bucket:
CELLD_BUCKET=s3://… STREAMS_CELLD_FLEET_REQUIRED=1 npm run smoke:program-cell-fleet-kill
```
