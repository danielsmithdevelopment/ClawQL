# Durability comparison — crash during an outside write

**Status:** ClawQL + live Pi Durable / Golem measured under `DURABILITY_COMPARISON_LIVE_PEERS=1`  
**Crash point measured:** **outside write in flight** (request visible / sent; result not yet recorded)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

This board measures **effect** outcomes under one deliberate crash window, not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

**`harnessValid`** means each trial reached a valid protocol outcome for that arm’s rules. It is **not** “the arm behaved well on the product metric.” Read the metric columns on their own.

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

## Metric columns

| Column                     | Meaning                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Duplicates**             | Same side effect applied twice (e.g. payment charged twice).                                                                 |
| **Interrupted or unknown** | After recovery the agent still does not know whether the charge landed (ClawQL `outcome_unknown` ≡ Pi tool **interrupted**). |
| **Completed exactly once** | Charge landed once **and** the task finished with a known success — catches “interrupted → give up, order never confirmed.”  |

Older evidence may still show `outcomeUnknown`; readers should treat it as the interrupted-or-unknown column.

---

## The fairness gap this board closes

A never-retry faux model makes Pi Durable look like “0 duplicates, nothing to resolve,” while ClawQL looks like “0 duplicates, N problems.” Both left the charge outcome unknown; only ClawQL labeled it. And Pi’s zero depends on the model choosing not to retry — John’s demos suggest real models often do.

Honest non-idempotent contrast (agent policy × stack) — cells are **dup / unk / once** (N=50):

| Arm, non-idempotent API (no keys) | Model never retries | Model always retries |
| --------------------------------- | ------------------- | -------------------- |
| **Pi Durable**                    | 0 / 50 / 0          | **50 / 0 / 0**       |
| **Golem** (runtime re-send)       | **50 / 0 / 0**      | **50 / 0 / 0**       |
| **ClawQL** (structural gate)      | 0 / 50 / 0          | **0 / 50 / 0**       |

Read all three numbers: ClawQL always-retry is **0 duplicates** and also **50 unknown / 0 completed** — safe but unfinished. Golem retries at the runtime regardless of agent policy, so both columns show duplicates on a server that ignores keys.

ClawQL guarantees at-most-once structurally; Pi Durable leaves the retry decision to the model; Golem re-sends at the runtime. That is the question for Earendil / John — alongside whether the faux-model setup is what they’d want, and whether a live-model arm (`pi-durable-real-model`) matches their preferred demo.

**Check-then-decide turns “safe” into “done”** (`clawql-check-then-decide`, measured): on a non-idempotent mock that supports **exact lookup by `clientReference`**, resume finds the charge and reconciles → **0 / 0 / 50**. Pi has no equivalent mechanism; Golem’s only mechanism is the key this server ignores. Only APIs offering neither keys nor lookup still need a person. See [check-then-decide](../../gtm/golem-overlap-and-durability-honesty.md#why-outcome-unknown-and-why-that-does-not-undermine-durability).

---

## What is being compared (and what is not)

| Arm                       | Role                               | Notes                                                                     |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| **celld / ProgramCellDO** | ClawQL’s **own** journal substrate | Not a rival. Tiers **B** and **C** already measure program mode on celld. |
| **Pi Durable**            | Durable **agent harness**          | Peer — tool `replay` policy + **model retry policy** under test.          |
| **Golem**                 | Durable **execution runtime**      | Peer — mid-function resume; outbound retries + idempotency keys.          |

---

## Live peer configuration (ask maintainers: “Is this how you’d set it up?”)

| Arm                        | Pinned versions                                                                                  | Configuration under test                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi-durable-never-retry`   | `@earendil-works/pi-durable@1.4.0`, `@earendil-works/pi-ai@1.4.0`, `@earendil-works/chord@1.4.0` | Tool `peer.charge` **`replay: "unsafe"`**. Faux model **never** re-issues after interrupt. SIGKILL mid-execute. Expect 0 / N / 0.                                     |
| `pi-durable-always-retry`  | same                                                                                             | Same crash; faux model **always** re-issues `peer.charge` after interrupt. Expect non_idempotent → N / 0 / 0; idempotent → 0 / 0 / N via key.                         |
| `pi-durable-real-model`    | same + provider key                                                                              | Live LLM after interrupt (`DURABILITY_COMPARISON_PI_REAL_MODEL=1` + `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). Measures actual retry rate.                              |
| `golem`                    | `golem` CLI **1.6.2**, `@golemcloud/golem-ts-sdk@2.0.2`                                          | Local `golem server`; `WriteAgent` fetch mid-flight + `golem agent simulate-crash`. Runtime re-sends; on a key-ignoring server both agent-policy columns show N dups. |
| `clawql-file-journal`      | in-repo durable runner                                                                           | SIGKILL mid-write. **non_idempotent:** 0 / N / 0. **idempotent:** keyed resume → 0 / 0 / N.                                                                           |
| `clawql-always-retry`      | in-repo durable runner                                                                           | Agent always re-issues `execute`; gate refuses (`mandate_consumed`). Non_idempotent → **0 / N / 0** (safe, unfinished).                                               |
| `clawql-check-then-decide` | in-repo durable runner                                                                           | Non-idempotent mock + `clientReference` lookup: find charge after crash → **0 / 0 / N**.                                                                              |

---

## Arms

| Arm id                     | Stack / policy                                               |
| -------------------------- | ------------------------------------------------------------ |
| `clawql-file-journal`      | Structural at-most-once                                      |
| `clawql-always-retry`      | Structural gate under always-retry agent                     |
| `clawql-check-then-decide` | Lookup-by-reference reconcile (non_idempotent mock)          |
| `clawql-program-celld`     | ProgramCellDO on celld (Tier B/C; skipped inside Node board) |
| `pi-durable-never-retry`   | Live Pi + faux never-retry                                   |
| `pi-durable-always-retry`  | Live Pi + faux always-retry                                  |
| `pi-durable-real-model`    | Live Pi + real LLM (env-gated)                               |
| `golem`                    | Live local Golem (env-gated)                                 |
| `pi-durable+clawql`        | Combination — ClawQL gate under always-retry                 |
| `golem+clawql`             | Combination — ClawQL gate under always-retry                 |

---

## Implementation status

| Piece                                             | Status                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Duplicates + interrupted/unknown + completed-once | **Shipped** — `npm run benchmark:durability-comparison`  |
| Crash-point label: outside write in flight        | **Shipped**                                              |
| `clawql-file-journal` keyed resume (idempotent)   | **Shipped**                                              |
| `clawql-always-retry` structural refusal          | **Shipped**                                              |
| `clawql-check-then-decide` lookup-by-reference    | **Shipped**                                              |
| Pi never / always / real-model agent policies     | **Shipped** (real-model env-gated)                       |
| Pi Durable / Golem live arms                      | **Shipped** behind `DURABILITY_COMPARISON_LIVE_PEERS=1`  |
| Other four crash-point rows                       | **Not measured**                                         |
| Evidence                                          | [`comparison/evidence.json`](./comparison/evidence.json) |

### Commands

```bash
# CI default (peers stay pending_invite)
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
# Live local peers (faux never + always + Golem)
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_N=50 npm run benchmark:durability-comparison
# Optional real-model Pi arm
DURABILITY_COMPARISON_LIVE_PEERS=1 DURABILITY_COMPARISON_PI_REAL_MODEL=1 \
  OPENAI_API_KEY=… DURABILITY_COMPARISON_N=10 npm run benchmark:durability-comparison
```
