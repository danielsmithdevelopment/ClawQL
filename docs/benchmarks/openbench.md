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
| `codegraph-feature-api-surface` | Cross-file API wiring (B-3.1 Phase 1)                   |
| `memory-conflict-pricing`       | Flag vault price conflict; no confabulation (B-4.1)     |
| `memory-stale-after-update`     | Cache invalidation after write (B-4.2)                  |
| `memory-injection-attempt`      | Deny adversarial `memory_ingest` (B-4.3)                |

Advanced suite ledger (B-1…B-6 specs): [`openbench-advanced-specs.md`](openbench-advanced-specs.md).

Offline checker validation (no model):

```bash
python3 openbench/validate_tasks.py
```

## GitHub Actions A/B (CI + manual)

- **Offline:** main CI always runs `python3 openbench/validate_tasks.py`.
- **Live A/B:** [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml) runs on path-filtered PR/push to `main` and via `workflow_dispatch`.
- **Default model:** `openrouter/deepseek/deepseek-chat` — preferred secret: **`OPENROUTER_API_KEY`** (bring your existing aggregator key; no per-provider BYOK required).
- Missing secrets → live A/B **skipped** on PR/push (exit 0); manual dispatch still fails closed.
- Optional later: switch `model` to direct BYOK ids (`deepseek/*`, `anthropic/*`, …) when you add vendor keys.

See [`openbench-github-actions.md`](openbench-github-actions.md).

## Reproduce live cells

See [`openbench/README.md`](../../openbench/README.md) and
[`openbench/scripts/run-with-openbench.sh`](../../openbench/scripts/run-with-openbench.sh).

Live runs need agent CLI credentials plus an OpenRouter or BYOK inference secret in CI.

## Relation to planning-context benchmarks

Existing [`latest.md`](latest.md) / workflow stats measure **planning-context**
compression (full specs vs search outputs). OpenBench measures **agent
execution** (harness + model + task). Use both: context math for gateway
efficiency, OpenBench for end-to-end harness competition.
