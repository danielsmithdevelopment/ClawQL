# Durability comparison board — celld · Pi Durable · Golem

**Status:** plan (not measured)  
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
| Program-mode durability vs Pi Durable / Golem             | **Only after Tier C** (fleet LTX + three-arm) passes                                                                                   |
| Named public board with “Pi Durable” / “Golem”            | After maintainer invitation (same rule as other peer boards)                                                                           |
| De Goes / CEO outreach with numbers                       | After Tier C + private config check — [outreach order](../../gtm/golem-overlap-and-durability-honesty.md#outreach-timing-ceo--de-goes) |

---

## Implementation notes (next engineering)

1. Generalize `kill-mid-write-board` to emit `{ duplicates, outcome_unknown, lost }` per trial and per upstream mode.
2. Adapter interface: `startArm` / `killMidWrite` / `resume` / `sideEffectCount` — file-journal and ProgramCellDO first; Pi/Golem adapters behind feature flags + invite.
3. Evidence path: `docs/benchmarks/durability-proof/comparison/evidence.json` (schema TBD); do not overwrite Tier D file-journal evidence.
4. CI: ClawQL arms only until peers are invited; optional workflow_dispatch for combination arms.
