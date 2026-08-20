# Harvey LAB rules compliance (ClawQL)

**Audited:** 2026-08-20 against upstream [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) (`CONTRIBUTING.md`, `docs/architecture.md`, `docs/eval-strategies.md`), Harvey’s [LAB launch post](https://www.harvey.ai/blog/introducing-harveys-legal-agent-benchmark), and the public peer write-up ([Trajectory × Nemotron on LAB](https://trajectory.ai/field-notes/harvey-nemotron-3-ultra)).

Formal submission / leaderboard **normalization standards are not published yet** (Harvey: “coming”). Until then we treat the repo docs + peer practice as the bar.

## Two claim types (do not mix)

| Claim | Tools | What it measures |
| ----- | ----- | ---------------- |
| **Model / stock harness** | Harvey’s six only (`bash`, `read`, `write`, `edit`, `glob`, `grep`) | Model + stock agent stack |
| **Agent-stack (ClawQL)** | Six + `clawql_*` MCP tools + pre-ingest | Same tasks/rubrics/judge pipeline, with retrieval/SQL layer |

Harvey’s blog explicitly wants tracking of improvements on **any part of the agent stack**. Trajectory’s public LAB numbers are the **model** kind (same harness/grading; post-train weights). Our publishable ClawQL story is the **agent-stack** kind and must always ship a **baseline arm** (stock six tools, same model) beside it.

## Checklist vs upstream rules

### Adapter contribution (`CONTRIBUTING.md`)

| Rule | Status | Notes |
| ---- | ------ | ----- |
| Implement `ModelAdapter` under `harness/adapters/` | Pass | `clawql.py`, `clawql_chat.py` |
| Register in `create_adapter()` / `run.py` | Pass | Marker blocks only via `apply_clawql_adapter.py` |
| Report token usage on `ModelResponse` | Pass | Inherited Anthropic path; `openrouter_chat.py` sets `input_tokens` / `output_tokens` |
| Add `SWEEP_MATRIX` entries in `utils/sweep.py` | Gap | We drive runs via ClawQL scripts/GHA, not Harvey `utils.sweep` |
| Pricing / display names in `evaluation/compare.py` | Gap | Optional until we use Harvey dashboards for ClawQL IDs |
| Offline tests / smoke for message formatting | Partial | `tests/test_openrouter_mapping.py`; no full Harvey `pytest` in CI |

### Architecture / harness integrity

| Rule | Status | Notes |
| ---- | ------ | ----- |
| Do not rewrite `agent_loop.py` | Pass | Enforced by `verify-harvey-overlay-safe.sh` |
| Stock path keeps six closed tools | Pass | Baseline / `nemotron` arms; ClawQL tools only on `clawql*` adapters |
| Sandbox for the six tools | Pass | Unchanged ToolExecutor → Podman |
| ClawQL tools stay outside Podman | **Disclose** | MCP proxy on host (retrieval stack). Label as agent-stack, not “same tools as Harvey baseline” |
| Tasks / rubrics / `run_eval` unchanged | Pass | We score Harvey `task.json` criteria via stock `evaluation.run_eval` (default apply) |
| Default apply leaves `judge.py` / `anthropic.py` stock | Pass | `--openrouter-hooks` is **ClawQL GHA only** — never for Harvey-facing apply |

### Evaluation methodology (`docs/eval-strategies.md`)

| Rule | Status | Notes |
| ---- | ------ | ----- |
| Headline = **all-pass** (task `1.0` iff every criterion passes) | Pass | Scorecards / aggregates use this |
| Report criterion pass rate as diagnostic | Pass | CPR in aggregates |
| Default / publishable judge = `claude-sonnet-4-6` | **Gap for claims** | GHA/debug often uses `openai/gpt-5.4-mini`; local uses Ollama Qwen. Re-score (or run) with Sonnet 4.6 before Harvey-facing numbers |
| Optional `--dual` (Sonnet 4.6 + GPT-5.5) | Gap | Not wired in ClawQL runners yet |
| Temperature 0 judge, binary verdicts, scoped deliverables | Pass | Upstream scorer unchanged |

### Peer practice (Trajectory)

| Practice | Our alignment |
| -------- | ------------- |
| Same held-out tasks + grading | Yes for firm-knowledge rubrics / `run_eval` |
| Headline all-pass + CPR diagnostic | Yes |
| Model-only story (no extra tools) | **N/A for ClawQL arm** — we must not present ClawQL as a model-only result |
| Cost / token efficiency narrative | Supported when token metrics are present; keep baseline arm for token deltas |

## What we are following correctly

1. **Overlay contract** — new files + minimal `run.py` markers; core loop untouched (`HARVEY.md`, `verify-harvey-overlay-safe.sh`).
2. **Paired arms** — `nemotron` vs `nemotron-clawql` (and Claude baseline vs clawql when used).
3. **All-pass scoring** on Harvey rubrics — no custom weights / golden files.
4. **Stack lineage** — `ts-clawql-data-v2` vs quarantined `python-duckdb-v1` so we do not cite tainted runs.
5. **Synthetic firm-knowledge corpus only** — no real client data.

## Gaps before a formal / Harvey-facing submission

1. **Publishable judge** — run or re-judge with `claude-sonnet-4-6` (Harvey default). Treat `gpt-5.4-mini` / local Ollama as debug only.
2. **Clean `ts-clawql-data-v2` multi-task ledger** — contiguous 001–025 (or agreed slice) with public Actions/local run IDs; remove `.skip-lab-matrix` only after that.
3. **Disclose agent-stack deltas** in any write-up: extra tools (`clawql_memory_*`, `clawql_sql`, …), system-prompt extension, Node pre-ingest / DuckDB.
4. **Do not ship `--openrouter-hooks` apply** to Harvey or to “stock harness” claims.
5. **Optional polish** — `SWEEP_MATRIX` + `compare.py` entries; `--dual` for external claims; confirm token fields land in every arm’s `metrics.json`.

## Operator one-liner

> Baseline arm = Harvey stock tools + same model + same judge. ClawQL arm = agent stack on the same tasks. Publish only `ts-clawql-data-v2` + Sonnet 4.6 (or dual) scores; never mix Python-DuckDB legacy or debug judges into the headline.

## Related

- [`integrations/harvey-labs/HARVEY.md`](../../integrations/harvey-labs/HARVEY.md)
- [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md)
- [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)
- [`../design/harvey-lab-duckdb-retrieval.md`](../design/harvey-lab-duckdb-retrieval.md)
