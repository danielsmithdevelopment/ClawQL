# Strong-model agent loop (freeze-critical, schedule now)

## Why start now

Freeze is **2026-10-15**. Two prove-or-purge rows share this harness:

| Target | Unique job to prove | Control |
| ------ | ------------------- | ------- |
| `pageindex_*` (opt-in catalog) | Tree navigate / synthesize beats plain tools on deep docs | **grep** + `read_around` / `memory_recall` |
| `codegraph_*` | Callers / impact / cross-file beats text search | **grep** on the same jobs |

Agent-lite already showed ClawQL’s **ranker-mode** PageIndex merge is harmful or unproven. That does **not** settle the catalog tools. Waiting for k-sweep serializes the critical path.

## Parallelism (do not serialize)

| Track | Work | Blocks purge of |
| ----- | ---- | --------------- |
| **A** | [Vectify fair test](vectify-fair-test.md) (misses + no-harm; Net≥5) | Port-vs-purge for PageIndex *design* |
| **B (this doc)** | Strong-model agent loop: ClawQL `pageindex_*` + `codegraph_*` vs grep | Catalog keep/purge |
| **C (can lag)** | k-sweep `{3,6,10}` + union matched-k | Default top-k / union confound only |

## How Tracks A and B combine (locked)

| Track A (Vectify vs qrewrite) | Track B (ClawQL vs grep) | Freeze action |
| ----------------------------- | ------------------------ | ------------- |
| Vectify **beats** (Net≥5 + no-harm) | ClawQL **loses** | **Purge** current `pageindex_*` at 8.0.0; rebuild on Vectify design **after** 8.0.0; ship only once proven |
| Vectify **loses** or **tie** | loses / tie | **Purge**, done |
| any | ClawQL **beats** grep | **Keep opt-in** |
| Vectify beats | ClawQL also beats | Keep opt-in; Vectify design remains an upgrade path |

`codegraph_*`: Track B only (grep-insoluble jobs).

## Arm sketch

| Arm id | Tools | Model |
| ------ | ----- | ----- |
| `A-grep` | `grep`, `read_around` / file read | strong (**same** for all B arms) |
| `A-pageindex` | `pageindex_build_tree` (setup), `pageindex_traverse`, `pageindex_get_content`, `pageindex_synthesize` (+ optional `read_around`) | strong |
| `A-codegraph` | `codegraph_*` on **grep-insoluble** code jobs only | strong |

Budget: same as factorial (`max_tool_calls` ≤ 12, timeout 180s) unless a cell documents a higher ceiling. Grade **answer-only** strict accuracy; report n + sign-test / McNemar vs `A-grep`.

**Beat (Track B):** use the same spirit as Track A — Net \(\ge 5\) on the paired contrast (or exact McNemar p&lt;0.05 with Net≥3 if n is larger). Ties → do not keep. Document the chosen n before spend.

## Cohort

- **Docs / PageIndex:** [12 deep RFC misses](deep-rfc-misses.json) + [15 no-harm hits](no-harm-rfc-hits.json) when comparing structural tools; expand only after A clears.
- **Code / CodeGraph:** only jobs where gold is **not** a trivial grep hit. The six hard-candidate code misses that grep already solves are **out**.

## Runner

```bash
# Schedule manifest (no spend)
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run

# Live — wire MCP tool loop + OPENROUTER_API_KEY (GHA when ready)
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs \
  --corpus hard-candidate \
  --cohort deep-rfc \
  --model <same-strong-as-track-A-chat> \
  --arms A-grep,A-pageindex \
  --out benchmarks/pageindex-ab/results/agent-loop-freeze/
```

Do not block on Track C.
