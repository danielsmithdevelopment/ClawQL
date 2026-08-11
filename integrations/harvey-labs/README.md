# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

## Three arms

| Arm | Model flag | Meaning |
| --- | ---------- | ------- |
| A `baseline` | `anthropic/<claude>` | No ClawQL |
| B `clawql` | `clawql/<claude>` | Claude + ClawQL |
| C `nemotron-clawql` | `clawql-cc/<openrouter-id>` | Nemotron 3.5 Lightning + ClawQL |

Publishable A/B is Opus vs Opus. Arm C compounds Harvey/Trajectory’s LAB post-train (published **8.3% all-pass**) with ClawQL retrieval.

## Run path: GitHub Actions (preferred)

Same as OpenBench: use repo secret **`OPENROUTER_API_KEY`**. Do not depend on Cursor Cloud Agent env secrets.

```bash
# Phase A — Sonnet A/B
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f model=claude-sonnet-4-6 \
  -f max_turns=15 \
  -f arms=baseline,clawql \
  -f max_matters=5

# Include Arm C
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f model=claude-sonnet-4-6 \
  -f nemotron_model=nvidia/nemotron-3.5-lightning:free \
  -f max_turns=15 \
  -f arms=baseline,clawql,nemotron-clawql \
  -f max_matters=5
```

Workflow: [`.github/workflows/harvey-lab-firm-knowledge.yml`](../../.github/workflows/harvey-lab-firm-knowledge.yml)  
Pause / resume: [`docs/benchmarks/harvey-lab-pause-handoff.md`](../../docs/benchmarks/harvey-lab-pause-handoff.md)  
Plan reconciliation: [`docs/benchmarks/harvey-lab-action-plan.md`](../../docs/benchmarks/harvey-lab-action-plan.md)

## What this provides

| Path | Purpose |
| ---- | ------- |
| `harness/adapters/clawql.py` | Anthropic + MCP tools + pre-ingest / cleanup |
| `harness/adapters/clawql_chat.py` | OpenRouter chat completions + same vault/MCP (Arm C) |
| `harness/adapters/clawql_lab_session.py` | Shared vault / ingest / MCP session |
| `harness/adapters/clawql_openrouter.py` | OpenRouter Anthropic + OpenAI clients |
| `harness/adapters/clawql_system_prompt.md` | Recall-first guidance for ClawQL arms |
| `harness/clawql_tools.py` | Routes `clawql_*` → MCP |
| `scripts/apply_clawql_adapter.py` | Copies + patches into a harvey-labs checkout |
| `scripts/run-lab-gha.sh` | GHA entrypoint (clone, arms, scorecard) |
| `tests/test_vault_isolation.py` | Task-scoped vault isolation unit tests |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP HTTP startup |

## Firm-knowledge specifics

- Tasks: `tasks/firm-knowledge/tasks/<id>/task.json` (**250**)
- Documents: shared DMS via `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest seeds priority docs per matter (not every binary)
- Vault isolation is per task (delete/recreate)

## Phases (cost discipline)

| Phase | Model | Scope |
| ----- | ----- | ----- |
| A–D | Sonnet (OpenRouter) | 1→few tasks, isolation, prompt |
| E | Opus A/B (+ Nemotron C) | Publishable ledger |
| Judge | Sonnet | Always |

Immediate LAB does **not** require our own DPO/GRPO — Arm C uses NVIDIA/Trajectory post-train + ClawQL.

## Results ledgers

- `docs/benchmarks/harvey-lab-baseline.md`
- `docs/benchmarks/harvey-lab-clawql-results.md`
- `docs/benchmarks/harvey-lab-pause-handoff.md`
- `docs/benchmarks/harvey-lab-action-plan.md`

Do not outreach to Harvey until the Opus two-arm ledger exists (Arm C preferred).
