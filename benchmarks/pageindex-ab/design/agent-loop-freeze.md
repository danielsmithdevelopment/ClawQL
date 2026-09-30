# Strong-model agent loop (freeze-critical) — Track B

## Status

**PageIndex purged** ([#1175](https://github.com/danielsmithdevelopment/ClawQL/pull/1175)) — stands. Fair-test record is **void, retest** ([fair-test-void-retest.md](fair-test-void-retest.md)); Vectify redesign elevated post-8.0.  
**Track B scope (shrunk):** **`codegraph_*` vs grep** only — not PageIndex, not the spent RFC deep-miss set.

**Critical path to 2026-10-15:** **human-pass** (acceptance sampling — [HUMAN_PASS_ONE_SITTING.md](HUMAN_PASS_ONE_SITTING.md)) then live spend under the **locked** decision rule ([codegraph-prove-decision.lock.json](codegraph-prove-decision.lock.json)). If unsigned or spend missing by freeze → purge-inventory default applies and **`codegraph_*` leaves the bundle**.

**RFC “8 unsolved”:** reviewed offline — **7/8 defective**; **1 sound**. See [`unsolved-8-key-review.md`](unsolved-8-key-review.md). **Do not spend Track B budget on them.**

## Caveat (locked in)

Twelve prove keys on **one TypeScript monorepo** (ClawQL) is a **small test on CodeGraph’s home turf**. That is why the beat rule mirrors Vectify: predeclared Net margin, mandatory no-harm on grep-solvable keys, and a **no-tools** arm (public repo → possible memorization).

## Why

| Target | Unique job to prove | Controls |
| ------ | ------------------- | -------- |
| `codegraph_*` | Callers / impact / explore on real multi-file code | **`A-grep`**, **`A-no-tools`** (memory), no-harm cohort |

## Parallelism

| Track | Work | Outcome |
| ----- | ---- | ------- |
| **A (done)** | [Vectify fair test](vectify-fair-test.md) | Tie → purge; Vectify design → [post-8.0 backlog](../../../docs/backlog/post-8.0-vectify-pageindex.md) |
| **B (this doc)** | CodeGraph vs grep (+ no-tools / no-harm) | Keep opt-in or leave bundle at freeze |
| **C (schedule — not lag)** | k-sweep `{3,6,10}` + union matched-k | Own-budget / displacement control |

## Cohorts

| Cohort | n | File | Counts toward Net? |
| ------ | - | ---- | ------------------ |
| **Prove** | 12 | [`codegraph-prove-keys.md`](codegraph-prove-keys.md) | **Yes** |
| **No-harm** | 6 | [`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json) | **No** (gate only) |

Both cohorts run on **all three arms** every live spend.

## Arms (same frontier as Track A)

**Locked model:** `PAGEINDEX_AB_AGENT_MODEL` = `VECTIFY_FAIR_MODEL` = **`anthropic/claude-sonnet-4.6`**.

| Arm id | Tools | Purpose |
| ------ | ----- | ------- |
| `A-no-tools` | *(none)* | How much can the model answer from **memory** alone? ClawQL is public. |
| `A-grep` | `grep`, `read_around` | Control |
| `A-codegraph` | `codegraph_*` + `read_around` (**no grep**) | Treatment |

Budget: `max_tool_calls` ≤ 12, timeout 180s unless a cell documents higher. Grade **answer-only** strict accuracy.

## “Beat” definition (locked before first live run)

Canonical lock file: [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json).

On the **prove** cohort only:

Let \(W\) = # CodeGraph correct and grep wrong  
Let \(L\) = # grep correct and CodeGraph wrong  
**Net** \(= W - L\)

| Outcome on prove | Condition | Meaning |
| ---------------- | --------- | ------- |
| **CodeGraph beats** | Net \(\ge 5\) **and** no-harm pass | Keep `codegraph_*` opt-in candidate |
| **Tie** | Net \(\in [-4, +4]\) | **Counts as purge** — leave bundle |
| **Grep beats** | Net \(\le -5\) | Purge |

**No-harm pass (required for any CodeGraph win):** on the 6 grep-solvable keys, `A-codegraph` answer-correct \(\ge 5\) (allow one flake). Recovery that breaks easy questions is **not** a win — treat as tie → purge.

**No-tools reporting (required, does not change the beat):** publish `A-no-tools` rates on prove + no-harm. If memory alone clears many prove keys, Net vs grep overstates tool value — still do not keep on memory alone.

Grep-soluble keys **never** count toward Net. Smoke / contaminated-smoke do **not** count ([purge evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules)).

## Human pass before spend

See [`HUMAN_PASS_ONE_SITTING.md`](HUMAN_PASS_ONE_SITTING.md):

1. Review **all 12** prove keys (confirm a single grep cannot answer each).
2. Review a **stratified random sample of ~60** doc keys; if **≥3 defects**, stop and fix the builder — do not sign.
3. Sign both gates; only then schedule the live loop.

## Runner

```bash
# Dry-run schedule (no spend) — after human pass
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run \
  --cohort codegraph-prove \
  --arms A-no-tools,A-grep,A-codegraph

# Live — only after HUMAN_PASS_ONE_SITTING signed + lock file unchanged
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs \
  --cohort codegraph-prove \
  --model anthropic/claude-sonnet-4.6 \
  --arms A-no-tools,A-grep,A-codegraph \
  --out benchmarks/pageindex-ab/results/agent-loop-freeze/
```

## Related

- [`codegraph-prove-keys.md`](codegraph-prove-keys.md) / [`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json)  
- [`unsolved-8-key-review.md`](unsolved-8-key-review.md)  
- [`query-rewrite-arm.md`](query-rewrite-arm.md) — k-sweep elevation  
- Purge inventory: [`8.0.0-purge-inventory-spec-v0.1.md`](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md)
