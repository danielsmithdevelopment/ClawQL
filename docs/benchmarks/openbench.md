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

| Task                              | Differentiator                                                              |
| --------------------------------- | --------------------------------------------------------------------------- |
| `memory-dependent-continuation`   | Prior auth decisions only in vault memory after seed removal                |
| `token-budget-constrained`        | Nested YAML list recipe in vault memory; ignore `decoy/`; ≤5k-token scoring |
| `multi-provider-api-workflow`     | Offline Worker scaffold; wrangler/GitHub URL notes in vault when clawql-on  |
| `search-first-discovery`          | Must `search` for global GHSA list op; decoy names wrong id                 |
| `execute-verify-loop`             | `search` + ≥2 dry-run `execute` trail; decoy skips tools                    |
| `memory-roundtrip-ingest-recall`  | Empty vault: ingest marker → recall → `answer.json`                         |
| `ouroboros-oscillation-escape`    | Ouroboros on vs off under decoy thrash; see [value evidence](./ouroboros-value-evidence.md) |

Offline checker validation (no model):

```bash
python3 openbench/validate_tasks.py
```

## GitHub Actions A/B (CI + manual)

- **Offline:** main CI always runs `python3 openbench/validate_tasks.py`.
- **Live A/B (ClawQL on vs off):** [`.github/workflows/openbench-ab.yml`](../../.github/workflows/openbench-ab.yml) runs on path-filtered PR/push to `main` and via `workflow_dispatch`.
- **Live A/B (Ouroboros on vs off):** [`.github/workflows/openbench-ouroboros-ab.yml`](../../.github/workflows/openbench-ouroboros-ab.yml) — thrash-escape evidence; see [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md).
- **Default model:** `openrouter/deepseek/deepseek-chat` (cheap OpenRouter default; flash-lite also supported) — preferred secret: **`OPENROUTER_API_KEY`**.
- **Tool calling:** clawql-inference must passthrough OpenAI `tools` / `tool_calls` for OpenCode; see [`openbench-failure-root-cause-2026-07.md`](./openbench-failure-root-cause-2026-07.md).
- **Matrix (clawql on/off):** PR/push runs memory / token / multi-provider / **search-first** / **execute-verify** / **memory-roundtrip** when secrets are present.
- Missing secrets → live A/B **skipped** on PR/push (exit 0); manual dispatch still fails closed.
- Optional later: switch `model` to direct BYOK ids when you add vendor keys.

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

## Whole-stack coverage

Live task pack covers gateway core (search / execute / cache / audit / policy),
memory depth (roundtrip, seed-removal, token pressure, PageIndex, hybrid,
codegraph, external ingest, wikilink hops), automation (`schedule`, `notify`),
sandbox, composed safe-rollout, and stubbed Onyx knowledge cite — all with
clawql-on/off (or ouroboros on/off) and hard spend caps. Remaining gaps: n≥3
Wilson trials; ops-only live Slack/Onyx/Argo/R2.
Full map: [`openbench-stack-coverage.md`](./openbench-stack-coverage.md).
Scoreboard: [`openbench-results-ledger.md`](./openbench-results-ledger.md).
