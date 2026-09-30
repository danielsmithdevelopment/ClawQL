# Strong-model agent loop (freeze-critical) — Track B

## Status

**PageIndex purged** ([#1175](https://github.com/danielsmithdevelopment/ClawQL/pull/1175)) — stands. Fair-test record is **void, retest** ([fair-test-void-retest.md](fair-test-void-retest.md)); Vectify redesign elevated post-8.0.  
**Track B scope (shrunk):** **`codegraph_*` vs grep** only — not PageIndex, not the spent RFC deep-miss set.

**Critical path to 2026-10-15:** **human-pass** (acceptance sampling — [HUMAN_PASS_ONE_SITTING.md](HUMAN_PASS_ONE_SITTING.md)) then live spend under the **locked** decision rule ([codegraph-prove-decision.lock.json](codegraph-prove-decision.lock.json)). Lock is **clear to sign**. If unsigned or spend missing by freeze → purge-inventory default applies and **`codegraph_*` leaves the bundle**.

**RFC “8 unsolved”:** reviewed offline — **7/8 defective**; **1 sound**. See [`unsolved-8-key-review.md`](unsolved-8-key-review.md). **Do not spend Track B budget on them.**

## Product question (locked)

**Does adding `codegraph_*` improve today’s default (grep + read)?**  
Same “does adding X improve today’s default” test used everywhere else. Every coding agent already has grep — so the beat contrast is **grep + CodeGraph vs grep alone**.

A CodeGraph-only arm answers a different question (can CodeGraph *replace* grep?) and skews both ways. Keep it **diagnostic only**.

## Caveat (locked in)

Twelve prove keys on **one TypeScript monorepo** (ClawQL) is a **small test on CodeGraph’s home turf**. Predeclared Net margin, no-harm, no-tools, and **usage recording** (did the agent actually call `codegraph_*`?) keep a thin home-turf win from keeping the tools.

## Why

| Target | Unique job to prove | Controls |
| ------ | ------------------- | -------- |
| `codegraph_*` (bundled with grep) | Extra value of callers / impact / explore when grep is already available | **`A-grep`**, **`A-no-tools`**, no-harm cohort, usage rates |

## Parallelism

| Track | Work | Outcome |
| ----- | ---- | ------- |
| **A (done)** | [Vectify fair test](vectify-fair-test.md) | Tie → purge; Vectify design → [post-8.0 backlog](../../../docs/backlog/post-8.0-vectify-pageindex.md) |
| **B (this doc)** | grep+CodeGraph vs grep (+ no-tools / no-harm / usage) | Keep opt-in or leave bundle at freeze |
| **C (locked)** | model k-grid → [`rerank-model-grid.json`](rerank-model-grid.json); bakeoff → [`rerank-bakeoff.md`](rerank-bakeoff.md) | **`TOP_K_DOC=10`** (model norerank flat k10→k20). MaxP/blend on tune next; confirm fresh keys |

## Cohorts

| Cohort | n | File | Counts toward Net? |
| ------ | - | ---- | ------------------ |
| **Prove** | 12 | [`codegraph-prove-keys.md`](codegraph-prove-keys.md) | **Yes** |
| **No-harm** | 6 | [`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json) | **No** (gate only) |

Both cohorts run on required arms every live spend.

## Arms (same frontier as Track A)

**Locked model:** `PAGEINDEX_AB_AGENT_MODEL` = `VECTIFY_FAIR_MODEL` = **`anthropic/claude-sonnet-4.6`**.

| Arm id | Role | Tools | Purpose |
| ------ | ---- | ----- | ------- |
| `A-no-tools` | baseline | *(none)* | Memory alone (public repo) |
| `A-grep` | **control** | `grep`, `read_around` | Today’s default |
| `A-codegraph` | **treatment** | `grep`, `read_around`, `codegraph_*` | **Additive** — default PLUS CodeGraph (**beat arm**) |
| `A-codegraph-only` | diagnostic | `codegraph_*`, `read_around` (**no grep**) | Optional; “replace grep?” — **never decides freeze** |

Budget: `max_tool_calls` ≤ 12, timeout 180s unless a cell documents higher. Grade **answer-only** strict accuracy.

## “Beat” definition (locked before first live run)

Canonical lock file: [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json).

On the **prove** cohort, contrast **`A-codegraph` (grep+CodeGraph) vs `A-grep`**:

Let \(W\) = # treatment correct and grep-only wrong  
Let \(L\) = # grep-only correct and treatment wrong  
**Net** \(= W - L\)

| Outcome on prove | Condition | Meaning |
| ---------------- | --------- | ------- |
| **CodeGraph beats** | Net \(\ge 5\) **and** no-harm pass | Keep `codegraph_*` opt-in candidate |
| **Tie** | Net \(\in [-4, +4]\) | **Counts as purge** — leave bundle |
| **Grep beats** | Net \(\le -5\) | Purge |

Net is exactly the **extra value of bundling CodeGraph** on top of grep.

**No-harm pass (required for any win):** on the 6 grep-solvable keys, treatment answer-correct \(\ge 5\) (allow one flake). This checks that CodeGraph’s **extra tools do not distract** on easy questions — not whether CodeGraph can do grep’s job. Fail → tie → purge.

**Usage evidence (required report):** for every treatment-arm question, record whether any `codegraph_*` tool was called (`used_codegraph`, counts, names). Publish fractions on prove and no-harm. If the agent has both tools and **ignores CodeGraph**, that answers the purpose question on its own — weak evidence for bundling even if Net looks fine.

**No-tools reporting (required, does not change the beat):** publish `A-no-tools` rates on prove + no-harm.

**Diagnostic `A-codegraph-only`:** optional; never use for keep/purge.

Grep-soluble keys **never** count toward Net. Smoke / contaminated-smoke do **not** count ([purge evidence rules](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md#evidence-rules)).

## Human pass before spend

See [`HUMAN_PASS_ONE_SITTING.md`](HUMAN_PASS_ONE_SITTING.md) — **clear to sign** after this additive lock:

1. Review **all 12** prove keys (confirm a single grep cannot answer each).
2. Review a **stratified random sample of ~60** doc keys; if **≥3 defects**, stop and fix the builder — do not sign.
3. Sign both gates; only then schedule the live loop.

## Runner

Live tool loop is wired in-process (`agent_loop_tools.mjs`: `rg` grep, `read_around`, `clawql-codegraph`). Human pass is **passed** (`HUMAN_PASS_RESULT.json`).

**Spend path = GitHub Actions** (same as Vectify / agent-lite / gap-diagnose): `secrets.OPENROUTER_API_KEY` in [`.github/workflows/pageindex-ab.yml`](../../../.github/workflows/pageindex-ab.yml). Do **not** expect the Cloud Agent pod to hold the key.

```bash
# Trigger Track B spend (PR sentinel — remove after the run lands)
# Touch: benchmarks/pageindex-ab/.run-agent-loop-freeze
# Or workflow_dispatch mode=agent-loop-freeze after the workflow is on default branch.

# Local dry-run only (no spend)
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run \
  --cohort codegraph-prove \
  --arms A-no-tools,A-grep,A-codegraph

# Score beat from GHA artifact answers.jsonl
node benchmarks/pageindex-ab/scripts/decide_codegraph_beat.mjs \
  benchmarks/pageindex-ab/results/agent-loop-freeze/answers.jsonl
```

## Related

- [`codegraph-prove-keys.md`](codegraph-prove-keys.md) / [`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json)  
- [`unsolved-8-key-review.md`](unsolved-8-key-review.md)  
- [`query-rewrite-arm.md`](query-rewrite-arm.md) — k-sweep elevation  
- Purge inventory: [`8.0.0-purge-inventory-spec-v0.1.md`](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md)
