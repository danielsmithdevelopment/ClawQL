# OpenBench adoption for ClawQL

ClawQL now ships an [OpenBench](https://github.com/minghinmatthewlam/openbench)-compatible
pack under [`openbench/`](../../openbench/) so harness-level agent runs can be
compared on the same model and tasks.

## Why OpenBench

OpenBench measures coding-agent **harnesses** (wrappers) with:

- Objective `checker.sh` grading (pass/fail or partial `SCORE:`)
- Efficiency metrics (tokens, turns, wall time)
- Disposable workspaces and Wilson confidence intervals

ClawQL is a high-leverage MCP/tool layer those harnesses can use. Pairing them
quantifies whether ClawQL’s gateway (search/execute, memory, audit) improves
correctness or token cost versus raw harnesses.

## Two tracks

### Track A — ClawQL as a harness

`clawql <harness> --non-interactive` launches Claude Code / Codex / OpenCode /
Cursor with ClawQL MCP pre-wired, captures usage, and emits:

```text
CLAWQL_TOKENS: …
CLAWQL_TURNS: …
CLAWQL_BENCH_JSON: {…}
```

Python adapter: [`openbench/adapters/clawql.py`](../../openbench/adapters/clawql.py).

### Track B — ClawQL-specific tasks

| Task                            | Differentiator                                          |
| ------------------------------- | ------------------------------------------------------- |
| `memory-dependent-continuation` | Prior decisions only in vault memory after seed removal |
| `token-budget-constrained`      | Correctness + ≤5k-token budget scoring                  |
| `multi-provider-api-workflow`   | Offline multi-API Worker scaffold                       |

Offline checker validation (no model):

```bash
python3 openbench/validate_tasks.py
```

## One-off GitHub Actions A/B

Manual `workflow_dispatch` job: **clawql-inference → OpenRouter** (any catalog
model), OpenCode **clawql-on vs clawql-off**, Step Summary + JSON artifact, then
the runner exits. Requires repo secret `OPENROUTER_API_KEY`.

See [`openbench-github-actions.md`](openbench-github-actions.md).

## Reproduce live cells

See [`openbench/README.md`](../../openbench/README.md) and
[`openbench/scripts/run-with-openbench.sh`](../../openbench/scripts/run-with-openbench.sh).

Live runs need agent CLI credentials; CI in this repo only validates task
checkers.

## Relation to planning-context benchmarks

Existing [`latest.md`](latest.md) / workflow stats measure **planning-context**
compression (full specs vs search outputs). OpenBench measures **agent
execution** (harness + model + task). Use both: context math for gateway
efficiency, OpenBench for end-to-end harness competition.
