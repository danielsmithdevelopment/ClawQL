# Strong-model agent loop (freeze-critical) — Track B

## Status

**PageIndex purged** ([#1175](https://github.com/danielsmithdevelopment/ClawQL/pull/1175)) — stands. Fair-test record is **void, retest** ([fair-test-void-retest.md](fair-test-void-retest.md)); Vectify redesign elevated post-8.0.  
**Track B scope (shrunk):** **`codegraph_*` vs grep** only — not PageIndex, not the spent RFC deep-miss set.

**Critical path to 2026-10-15:** **human-pass** the drafted **grep-insoluble** CodeGraph questions on the ClawQL monorepo ([`codegraph-prove-keys.md`](codegraph-prove-keys.md)) **in the same sitting** as the grown doc-key pass ([`HUMAN_PASS_ONE_SITTING.md`](HUMAN_PASS_ONE_SITTING.md)). Tiny-repo “What file exports X?” is grep’s job and does **not** prove. If those questions are not signed by freeze → purge-inventory default applies and **`codegraph_*` leaves the bundle**.

**RFC “8 unsolved”:** reviewed offline — **7/8 defective** (TOC ghosts / list-step gold / wrong depth); **1 sound** (`hc-rfc-08-q03`). See [`unsolved-8-key-review.md`](unsolved-8-key-review.md). **Do not spend Track B budget on them.**

## Why

| Target | Unique job to prove | Control |
| ------ | ------------------- | ------- |
| `codegraph_*` | Callers / impact / cross-file on real multi-file code | **grep** (+ read) on the same jobs |

## Parallelism (updated)

| Track | Work | Outcome |
| ----- | ---- | ------- |
| **A (done)** | [Vectify fair test](vectify-fair-test.md) | Tie → purge; Vectify design → [post-8.0 backlog](../../../docs/backlog/post-8.0-vectify-pageindex.md) |
| **B (this doc)** | CodeGraph vs grep on **new** grep-insoluble keys | Keep opt-in or leave bundle at freeze |
| **C (schedule — not lag)** | k-sweep `{3,6,10}` + union matched-k | Own-budget / displacement control for any future addition |

## Beat (Track B)

Document n before spend. Prefer Net \(\ge 5\) on paired CodeGraph-correct / grep-wrong (or McNemar p&lt;0.05 with Net≥3 if n is larger). Ties → do not keep. Grep-soluble keys do not count toward the prove.

## Question-writing checklist (critical path)

Before any OpenRouter spend:

1. **Repo:** real multi-file tree (not toy single-file / “export X” fixtures).
2. **Job class:** callers-of, impact-of-change, cross-file dependency / path — answer **not** recoverable by one `grep` of a unique string.
3. **Gold:** verified by human or deterministic codegraph oracle on the same tree; cite symbol ids / edges.
4. **Negative control:** `A-grep` fails (or systematically underperforms) on the same question.
5. **n:** enough for the beat rule above; list drafted under [`codegraph-prove-keys.md`](codegraph-prove-keys.md) (12 keys, oracle assist) — **sign before** the run.

## Arms

**Shared frontier:** `anthropic/claude-sonnet-4.6` via `PAGEINDEX_AB_AGENT_MODEL`.

| Arm id | Tools | Model |
| ------ | ----- | ----- |
| `A-grep` | `grep`, file read / `read_around` | `anthropic/claude-sonnet-4.6` |
| `A-codegraph` | `codegraph_*` (+ read as needed) | same |

Budget: `max_tool_calls` ≤ 12, timeout 180s unless a cell documents higher. Grade **answer-only** strict accuracy; report n + sign-test / McNemar vs `A-grep`.

## Runner

```bash
# Schedule / dry-run (no spend) once prove keys exist
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run

# Live — only after design/codegraph-prove-keys.md (or equiv) lands
node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs \
  --corpus <real-repo-corpus> \
  --cohort codegraph-prove \
  --model anthropic/claude-sonnet-4.6 \
  --arms A-grep,A-codegraph \
  --out benchmarks/pageindex-ab/results/agent-loop-freeze/
```

## Related

- [`unsolved-8-key-review.md`](unsolved-8-key-review.md) — why RFC deep misses are off the path  
- [`query-rewrite-arm.md`](query-rewrite-arm.md) — shared top-k displacement lesson → k-sweep  
- Purge inventory: [`8.0.0-purge-inventory-spec-v0.1.md`](../../../docs/releases/8.0.0-purge-inventory-spec-v0.1.md)
