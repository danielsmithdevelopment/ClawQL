# Durability comparison board — celld · Pi Durable · Golem

**Status:** Schema **v2** tip package on stock **celld 0.6.3**. ClawQL arms remeasured with new columns; peer arms pending invite.  
**Package:** [`comparison/manifest.json`](./comparison/manifest.json) · board [`comparison/evidence.json`](./comparison/evidence.json)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

This board measures **effect** outcomes under crashes (duplicates + `outcome_unknown`), not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

---

## Tip package (what changed on the existing table)

| Change | Why |
| ------ | --- |
| Rerun ClawQL arms on stock **celld 0.6.3**; mark **0.4.0** rows superseded | Package must match the shipped runtime |
| Add **runtime / runtimeVersion** for every arm | Results are only meaningful per version |
| Add **intentPresentOnResume** for every arm | After the mid-flight bug: does the system still know a call was in flight? |
| Add **callVerifiedSent** for every arm | Crash landed after send (`inFlight` / host applied), not before |
| Regenerate **manifest** in one commit | Whole tip package is one artifact |

**Cells that stay as they are:** duplicates · outcome unknown · completed exactly once.

### Column set (schema v2)

| Column | Meaning |
| ------ | ------- |
| `runtime` / `runtimeVersion` | Exact binary or harness identity |
| `crashPhase` | Where the kill/scenario landed |
| `duplicates` | Same side effect twice |
| `outcomeUnknown` | In-flight write unresolved |
| `intentPresentOnResume` | Journal/status still shows the in-flight call after resume |
| `callVerifiedSent` | Upstream saw the call (or host applied) before the kill |
| upstream mode | `idempotent` · `non_idempotent` · (+ planned `lookup_by_reference`) |

---

## What is being compared (and what is not)

| Arm | Role | Notes |
| --- | ---- | ----- |
| **celld / ProgramCellDO** | ClawQL’s **own** journal substrate | Not a rival. Tiers **B** and **C** measure program mode on celld. |
| **Pi Durable** | Durable **agent harness** | Peer — resume-after-crash shape differs. |
| **Golem** | Durable **execution runtime** | Peer — mid-function resume; outbound retries + keys. |

Do **not** score celld as a third competitor next to Pi Durable and Golem. Score **ClawQL program mode on celld** vs those two.

---

## Metric: side effects under crashes (two columns + tip honesty)

All arms resume after a crash. Count **both** effect columns — never collapse to a single winner — and the two tip honesty columns:

| Column | Meaning |
| ------ | ------- |
| **Duplicates** | Same side effect applied twice |
| **Lost / `outcome_unknown`** | Write never applied, or nobody can tell |
| **intentPresentOnResume** | System still knows a call was in flight |
| **callVerifiedSent** | Crash after send, not a no-op kill before egress |

**Trade-off (honest framing — matches De Goes / Golem 1.6):**

| System | Favors | Interrupted third-party POST without keys |
| ------ | ------ | ----------------------------------------- |
| **Golem** | Completing the work | At least once → possible **duplicate** |
| **ClawQL** | Never repeating a consequential write | **At most once** → may be `outcome_unknown` |

Publish **all** columns on every arm.

---

## Upstream modes

1. **Idempotency-honoring** — Stripe-class: same key → one effect.  
2. **No idempotency** — retries can multiply effects.  
3. **Lookup by reference** — planned (lost-ack + neither-API expansion).  
4. **Neither keys nor lookup** — planned row (still pending).

---

## Arms

| Arm id | Stack |
| ------ | ----- |
| `clawql-file-journal` | Tier D / host file journal (remeasured every package) |
| `clawql-program-celld` | ProgramCellDO on **stock celld 0.6.3** (fleet tip imported) |
| `pi-durable` | Pi Durable alone (invite + config review) |
| `golem` | Golem alone (same) |
| `pi-durable+clawql` | Pi → ClawQL MCP |
| `golem+clawql` | Golem → ClawQL MCP |

---

## Expansion scenarios (new tests)

Pilot each at **N=50** across applicable arms, then maintainer config review, then **N=1000**.

| # | Scenario | Arms | Notes |
| - | -------- | ---- | ----- |
| 1 | Remaining four crash points for peers | Pi, Golem, ClawQL celld | before_intent · after_intent_before_call · after_call_before_journal · idle (peers today: during_call only) |
| 2 | Wedged owner | all three | Hang health, then kill. ClawQL tip N=100 already measured |
| 3 | Stale owner (split-brain) | ClawQL, Golem; Pi likely N/A | Ownership moves; old owner still writes/sends. ClawQL tip N=40 measured |
| 4 | Lost acknowledgment | all; once per API type | Server processed; response never arrives — keys / lookup / neither |
| 5 | Neither keys nor lookup API row | all | Still pending from before |
| 6 | Real-model Pi arm | Pi | Replaces faux model; needs API key |

---

## Order of work (locked)

1. Rerun the **existing** table on stock **0.6.3** and add the new columns.  
2. Regenerate the **manifest** (one tip package commit).  
3. Pilot each expansion scenario at **N=50** across arms.  
4. Send the package to maintainers for **configuration review**.  
5. Run the final **N=1,000**.

Do **not** publish named Pi/Golem boards before invite + review.

---

## Superseded (0.4.0 / fork-era)

Listed in [`manifest.json`](./comparison/manifest.json) `superseded[]`. Keep files for history; tip package claims must cite **celld 0.6.3** evidence only.

---

## Implementation status

| Piece | Status |
| ----- | ------ |
| Schema v2 columns | **Shipped** |
| File-journal + naive-retry remasure | **Shipped** (`npm run benchmark:durability-comparison`) |
| ProgramCellDO tip import (wedge) | **Shipped** (fleet JSON) |
| Package manifest | **Shipped** |
| Peer adapters + N=50 pilots | **Planned** / stubs |
| Final N=1000 package | After review |

### Commands

```bash
DURABILITY_COMPARISON_N=20 npm run benchmark:durability-comparison
# writes comparison/evidence.json + comparison/manifest.json
```
