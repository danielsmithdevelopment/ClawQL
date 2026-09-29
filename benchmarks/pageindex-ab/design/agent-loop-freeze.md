# Strong-model agent loop (freeze-critical, schedule now)

## Why start now

Freeze is **2026-10-15**. Two prove-or-purge rows share this harness:

| Target | Unique job to prove | Control |
| ------ | ------------------- | ------- |
| `pageindex_*` (opt-in catalog) | Tree navigate / synthesize beats plain tools on deep docs | **grep** + `read_around` / `memory_recall` |
| `codegraph_*` | Callers / impact / cross-file beats text search | **grep** on the same jobs |

Agent-lite (single retrieval → one completion) already showed ClawQL’s **ranker-mode** PageIndex merge is harmful or unproven. That does **not** settle the catalog tools. Waiting for k-sweep or query-rewrite serializes the critical path.

## Parallelism (do not serialize)

| Track | Work | Blocks purge of |
| ----- | ---- | --------------- |
| **A** | [Vectify fair test](vectify-fair-test.md) on 12 deep RFC misses vs query-rewrite | Port-vs-purge for PageIndex *design* |
| **B (this doc)** | Strong-model agent loop: ClawQL `pageindex_*` + `codegraph_*` vs grep | Catalog keep/purge |
| **C (can lag)** | k-sweep `{3,6,10}` + union matched-k | Default top-k / union confound only |

Track A can clear “should we port Vectify’s summaries + tree nav?” Track B clears “does our shipped tool surface earn a seat?” Both are needed before freeze; neither waits on C.

## Arm sketch

| Arm id | Tools | Model |
| ------ | ----- | ----- |
| `A-grep` | `grep`, `read_around` / file read | strong (same for all) |
| `A-pageindex` | `pageindex_build_tree` (setup), `pageindex_traverse`, `pageindex_get_content`, `pageindex_synthesize` (+ optional `read_around`) | strong |
| `A-codegraph` | `codegraph_*` on **grep-insoluble** code jobs only | strong |
| `A-full` | All of the above (diagnostic; not the contrast) | strong |

Budget: same as factorial (`max_tool_calls` ≤ 12, timeout 180s) unless a cell documents a higher ceiling. Graded with tier-1 + suite strict accuracy; report n + sign-test / McNemar vs `A-grep`.

## Cohort

- **Docs / PageIndex:** prefer the [12 deep RFC misses](deep-rfc-misses.json) plus any hard-candidate keys where agent-lite already fails under `H-idf` for structural reasons — not the full 150 until A clears.
- **Code / CodeGraph:** only jobs where gold is **not** in a trivial grep hit (export-name / string match). The six hard-candidate code misses that grep already solves are **out** of the prove set.

## Decision rule

- `pageindex_*`: keep opt-in only if `A-pageindex` beats `A-grep` on the doc cohort with graded n+interval; else purge catalog (or out-of-tree plugin).
- Independent of Track A: if Vectify wins A but ClawQL tools lose B → port Vectify design, do not keep the current thin tools as-is.
- `codegraph_*`: keep only if `A-codegraph` beats `A-grep` on unique jobs.

## Runner (scaffold next)

```bash
# Planned — wire when OPENROUTER_API_KEY + ClawQL MCP available
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs \
  --corpus hard-candidate \
  --cohort deep-rfc \
  --model <strong> \
  --arms A-grep,A-pageindex \
  --out benchmarks/pageindex-ab/results/agent-loop-freeze/
```

Until that lands, schedule the cell (model pick, key list, spend cap) and do not block on Track C.
