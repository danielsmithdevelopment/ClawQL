# Durability comparison board — celld · Pi Durable · Golem

**Status:** Schema **v2** tip package on stock **celld 0.6.3**. Default **N=50**. Live Golem / Pi Durable **N=50 already measured** on PR [#1432](https://github.com/danielsmithdevelopment/ClawQL/pull/1432) (`DURABILITY_COMPARISON_LIVE_PEERS=1`) — archive [`comparison/archive/evidence-pr1432-live-peers-n50.json`](./comparison/archive/evidence-pr1432-live-peers-n50.json); adapters under [`scripts/benchmarks/durability-comparison/peers/reference-pr1432/`](../../scripts/benchmarks/durability-comparison/peers/reference-pr1432/). Tip rows stay `pending_adapter` until those drivers are **rewired to schema v2** (do not substitute sims). ClawQL **lost-ack** pilot at N=50 (keys → keyed resend). **Do not publish named peer rows on /benchmarks until maintainers review.**  
**Package:** [`comparison/manifest.json`](./comparison/manifest.json) · board [`comparison/evidence.json`](./comparison/evidence.json)  
**Parent:** [STATUS.md](./STATUS.md) · [Golem honesty](../../gtm/golem-overlap-and-durability-honesty.md)

This board measures **effect** outcomes under crashes (duplicates + `outcome_unknown`), not whether a runtime’s in-process execution is durable. See [two kinds of durable](../../gtm/golem-overlap-and-durability-honesty.md#two-kinds-of-durable-do-not-conflate).

---

## Tip package (what changed on the existing table)

| Change | Why |
| ------ | --- |
| Rerun ClawQL arms on stock **celld 0.6.3** at **N=50**; mark **0.4.0** / N=20 rows superseded | Package must match shipped runtime; N=20 only bounds ~14% vs peers’ ~6% at N=50 |
| Add **runtime / runtimeVersion** (+ **harnessCommit**) for every arm | Results only meaningful per version / same tip commit |
| Add **intentPresentOnResume** for every arm | After the mid-flight bug: does the system still know a call was in flight? |
| Add **callVerifiedSent** for every arm | Crash landed after send, not before |
| **Wedged-owner** (and stale-owner) are **separate rows** | Hung-health-then-kill ≠ crash during outside write |
| Regenerate **manifest** in one commit | Whole tip package is one artifact — peers share `harnessCommit` |

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

1. **Idempotency-honoring** — Stripe-class: same key → one effect (lost-ack → keyed resend; one unique effect).  
2. **No idempotency** — retries can multiply effects.  
3. **Lookup by reference** — measured on ClawQL lost-ack row (check-then-decide; no resend).  
4. **Neither keys nor lookup** — measured on ClawQL lost-ack non_idempotent mode (stay `outcome_unknown`).

---

## Arms

| Arm id | Stack |
| ------ | ----- |
| `clawql-file-journal` | Tier D / host file journal (remeasured every package; also `lost_ack` row) |
| `clawql-program-celld` | ProgramCellDO on **stock celld 0.6.3** (fleet tip imported) |
| `naive-retry` | ClawQL reference: blind re-send after kill |
| `golem-at-least-once-sim` | **Internal harness only** (opt-in env) — never a public peer row |
| `pi-interrupt-sim` | **Internal harness only** (opt-in env) — never a public peer row |
| `pi-durable` | Pi Durable alone — live N=50 on PR #1432; tip `pending_adapter` until schema-v2 rewire |
| `golem` | Golem alone — live N=50 on PR #1432 (e.g. non_idempotent 50 dups / always retries); tip `pending_adapter` until schema-v2 rewire |
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

1. Rerun the **existing** table on stock **0.6.3** at **N=50** with new columns; separate wedge/stale rows.  
2. Regenerate the **manifest** (one tip package commit; peers on same `harnessCommit`).  
3. Run **N=50 expansion pilots** on this tip (include peer adapters when ready) **before / with** the config-review send — maintainers react to real results, not only a plan.  
4. Send package + pilot results for **configuration review**.  
5. Final **N=1,000** after review.

Do **not** publish named Pi/Golem boards before review. Prefer pilots **in** the review package (as with the original table), not only after invite.

---

## Superseded (0.4.0 / fork-era)

Listed in [`manifest.json`](./comparison/manifest.json) `superseded[]`. Keep files for history; tip package claims must cite **celld 0.6.3** evidence only.

---

## Implementation status

| Piece | Status |
| ----- | ------ |
| Schema v2 columns + N=50 default | **Shipped** |
| File-journal + naive-retry remasure N=50 | **Shipped** |
| ProgramCellDO during_call (non-wedge) | **Partial** (v3 tip import) |
| ProgramCellDO wedged_owner / stale_owner | **Shipped** as **own rows** |
| Peer model sims | **Internal only** (`DURABILITY_COMPARISON_INCLUDE_PEER_SIMS=1`) — not public |
| Real peer adapter rows | **pending_adapter** — no prior live in-repo N=50; rewire adapters |
| ClawQL lost-ack / neither pilot | **Shipped** N=50 (keys → keyed resend / one unique effect) |
| Package manifest | **Shipped** |
| Final N=1000 package | After review + green v3 |

### Commands

```bash
# default N=50
npm run benchmark:durability-comparison
# writes comparison/evidence.json + comparison/manifest.json
```
