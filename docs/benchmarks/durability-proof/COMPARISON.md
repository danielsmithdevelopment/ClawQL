# Durability comparison — crash during an outside write

**Status:** ClawQL + live Pi Durable / Golem measured under `DURABILITY_COMPARISON_LIVE_PEERS=1`  
**Crash point measured:** **outside write in flight** (request visible / sent; result not yet recorded)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

This board measures **effect** outcomes under one deliberate crash window (duplicates + `outcome_unknown`), not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

**`harnessValid`** means each trial reached a valid protocol outcome for that arm’s rules. It is **not** “the arm behaved well on the product metric.” Read duplicates / unknowns / effects in their own columns.

---

## Crash points (five-row board)

| Crash point                 | Measured here? | Notes                                                                                                   |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| **Outside write in flight** | **Yes**        | Hardest window: after the write is visible, before ack. Every trial on this board aims here on purpose. |
| Before write sent           | No             | Expect 0 dups / 0 unknowns if resume re-issues once.                                                    |
| After write acked           | No             | Expect 0 dups; resume continues past the write.                                                         |
| Idle between steps          | No             | Journal / checkpoint already durable.                                                                   |
| During model↔tool round     | No             | Peer-specific (Pi tool round; Golem invoke boundary).                                                   |

Until the other rows are measured, **do not** read this table as “Golem and Pi Durable always double-charge.” It is the in-flight-write row only.

---

## What is being compared (and what is not)

| Arm                       | Role                               | Notes                                                                     |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| **celld / ProgramCellDO** | ClawQL’s **own** journal substrate | Not a rival. Tiers **B** and **C** already measure program mode on celld. |
| **Pi Durable**            | Durable **agent harness**          | Peer — tool `replay` policy is the safety mechanism under test.           |
| **Golem**                 | Durable **execution runtime**      | Peer — mid-function resume; outbound retries + idempotency keys.          |

---

## Metric: side effects under crashes (two columns)

| Column                       | Meaning                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| **Duplicates**               | Same side effect applied twice (e.g. payment charged twice).       |
| **Lost / `outcome_unknown`** | Write never applied, or nobody can tell — human/operator resolves. |

---

## Live peer configuration (ask maintainers: “Is this how you’d set it up?”)

| Arm                   | Pinned versions                                                                                  | Configuration under test                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi-durable`          | `@earendil-works/pi-durable@1.4.0`, `@earendil-works/pi-ai@1.4.0`, `@earendil-works/chord@1.4.0` | Tool `peer.charge` with **`replay: "unsafe"`** (Pi default). Scripted **faux** model issues one tool call (not a live LLM). SIGKILL mid-execute after the write is visible. Resume: ToolTask recovery reports **interrupted** and does **not** re-run. **No harness stand-in for a model retry.** Upstream idempotent vs non_idempotent does not change this arm. |
| `golem`               | `golem` CLI **1.6.2**, `@golemcloud/golem-ts-sdk@2.0.2`                                          | Local `golem server`; `WriteAgent` fetch mid-flight + `golem agent simulate-crash`. Recovery re-sends outbound HTTP with the same idempotency key.                                                                                                                                                                                                                |
| `clawql-file-journal` | in-repo durable runner                                                                           | SIGKILL mid-write. **non_idempotent:** `outcome_unknown`, never re-send. **idempotent:** keyed resume with plan `idempotencyKey` → 0 dups, 0 unknowns.                                                                                                                                                                                                            |

---

## Arms

| Arm id                 | Stack                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `clawql-file-journal`  | Tier D / program journal                                     |
| `clawql-program-celld` | ProgramCellDO on celld (Tier B/C; skipped inside Node board) |
| `pi-durable`           | Live Pi Durable (env-gated)                                  |
| `golem`                | Live local Golem (env-gated)                                 |
| `pi-durable+clawql`    | ClawQL gate side of the combination                          |
| `golem+clawql`         | ClawQL gate side of the combination                          |

---

## Implementation status

| Piece                                           | Status                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| Dual columns + both upstream modes              | **Shipped** — `npm run benchmark:durability-comparison`  |
| Crash-point label: outside write in flight      | **Shipped**                                              |
| `clawql-file-journal` keyed resume (idempotent) | **Shipped**                                              |
| Pi Durable / Golem live arms                    | **Shipped** behind `DURABILITY_COMPARISON_LIVE_PEERS=1`  |
| Other four crash-point rows                     | **Not measured**                                         |
| Evidence                                        | [`comparison/evidence.json`](./comparison/evidence.json) |

### Commands

```bash
# CI default (peers stay pending_invite)
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
# Live local peers
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_N=50 npm run benchmark:durability-comparison
```
