# Strong-model agent loop (freeze-critical)

## Status

**Track A done:** fair-test **tie** Net=4 → **purge** ClawQL PageIndex product surface; **no Vectify port** ([`vectify-fair-decision.json`](vectify-fair-decision.json)).  
**Track B (this doc) is the last lever** for the **8** deep RFC misses still unsolved by every method including Vectify. If the agent loop fails → inspect those keys for defects (do not revive purged PageIndex on this spent set).

## Why

Freeze is **2026-10-15**. Remaining prove-or-purge / miss work:

| Target | Unique job to prove | Control |
| ------ | ------------------- | ------- |
| **8 deep RFC misses** (`tag: T`) | Grep+read agent loop recovers gold where IDF / rewrite / Vectify all failed | Single-shot IDF / prior arms |
| `codegraph_*` | Callers / impact / cross-file beats text search | **grep** on the same jobs |

ClawQL `pageindex_*` catalog tools are **purged** (Track A + heading-tree never cleared the bar). Do not schedule an `A-pageindex` keep decision on this spent key set.

## Parallelism

| Track | Work | Outcome |
| ----- | ---- | ------- |
| **A (done)** | [Vectify fair test](vectify-fair-test.md) | Tie → purge / no port; Vectify design → [post-8.0 backlog](../../../docs/backlog/post-8.0-vectify-pageindex.md) |
| **B (this doc)** | Grep+read agent loop on remaining 8 misses (+ codegraph vs grep) | Last lever; else key hygiene |
| **C (can lag)** | k-sweep `{3,6,10}` + union matched-k | Default top-k / union confound only |

## How Tracks A and B combine (locked — A settled)

| Track A (Vectify vs qrewrite) | Track B | Action |
| ----------------------------- | ------- | ------ |
| **Tie (done, Net=4)** | — | **Purge** current `pageindex_*` at 8.0.0; no Vectify port; redesign only post-8.0 on a **fresh** larger hard set |
| — | Grep+read **fails** on the 8 | Inspect the 8 keys for defects |
| — | CodeGraph **beats** grep on non-grep jobs | Keep `codegraph_*` opt-in |

## Arm sketch

**Shared frontier model (locked with Track A):** `anthropic/claude-sonnet-4.6` via `PAGEINDEX_AB_AGENT_MODEL` / `VECTIFY_FAIR_MODEL`.

| Arm id | Tools | Model |
| ------ | ----- | ----- |
| `A-grep` | `grep`, `read_around` / file read | `anthropic/claude-sonnet-4.6` |
| `A-codegraph` | `codegraph_*` on **grep-insoluble** code jobs only | same |

Budget: same as factorial (`max_tool_calls` ≤ 12, timeout 180s) unless a cell documents a higher ceiling. Grade **answer-only** strict accuracy; report n + sign-test / McNemar vs `A-grep`.

**Beat (Track B):** Net \(\ge 5\) on the paired contrast (or exact McNemar p&lt;0.05 with Net≥3 if n is larger). Ties → do not keep. Document the chosen n before spend.

## Cohort — 8 remaining deep misses

Unsolved by IDF, query-rewrite, and Vectify (`tag: T` in [`vectify-fair-decision.json`](vectify-fair-decision.json)):

1. `hc-rfc-08-q03`
2. `hc-rfc-05-q02`
3. `hc-rfc-01-q02`
4. `hc-rfc-01-q03`
5. `hc-rfc-04-q02`
6. `hc-rfc-03-q03`
7. `hc-rfc-03-q02`
8. `hc-rfc-07-q03`

(Vectify recovered 4/12: `hc-rfc-06-q02`, `hc-rfc-08-q02`, `hc-rfc-02-q02`, `hc-rfc-07-q02` — still below Net≥5; those keys are spent with the rest.)

- **Code / CodeGraph:** only jobs where gold is **not** a trivial grep hit.

## Runner

```bash
# Schedule manifest (no spend)
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run

# Live — wire MCP tool loop + OPENROUTER_API_KEY (GHA when ready)
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs \
  --corpus hard-candidate \
  --cohort deep-rfc \
  --model <same-strong-as-track-A-chat> \
  --arms A-grep \
  --out benchmarks/pageindex-ab/results/agent-loop-freeze/
```

Do not block on Track C.
