# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

## Run path: GitHub Actions (preferred)

Same as OpenBench: use repo secret **`OPENROUTER_API_KEY`**. Do not depend on Cursor Cloud Agent env secrets.

```bash
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f model=claude-sonnet-4-6 \
  -f max_turns=15 \
  -f arms=baseline,clawql \
  -f max_matters=0
```

Workflow: [`.github/workflows/harvey-lab-firm-knowledge.yml`](../../.github/workflows/harvey-lab-firm-knowledge.yml)  
Pause / resume: [`docs/benchmarks/harvey-lab-pause-handoff.md`](../../docs/benchmarks/harvey-lab-pause-handoff.md)

## What this provides

| Path | Purpose |
|---|---|
| `harness/adapters/clawql.py` | Anthropic adapter + MCP tools + pre-ingest / cleanup |
| `harness/adapters/clawql_openrouter.py` | OpenRouter Anthropic client (GHA) |
| `harness/adapters/clawql_system_prompt.md` | Recall-first guidance for ClawQL arm |
| `harness/clawql_tools.py` | Routes `clawql_*` tool calls to MCP |
| `scripts/apply_clawql_adapter.py` | Copies + patches into a harvey-labs checkout |
| `scripts/run-lab-gha.sh` | GHA entrypoint (clone, both arms, scorecard) |
| `tests/test_vault_isolation.py` | Task-scoped vault isolation unit tests |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP HTTP startup |

## Firm-knowledge specifics

- Tasks: `tasks/firm-knowledge/tasks/<id>/task.json` (**250**)
- Documents: shared DMS via `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest seeds priority docs per matter (not every binary)
- Vault isolation is per task (delete/recreate)

## Local overlay (optional debug)

```bash
git clone https://github.com/harveyai/harvey-labs.git
cd harvey-labs && uv sync   # + podman + lab-sandbox image

python /path/to/ClawQL/integrations/harvey-labs/scripts/apply_clawql_adapter.py \
  --harvey-labs "$PWD"

export CLAWQL_LAB_USE_OPENROUTER=1
export OPENROUTER_API_KEY=…   # never commit
/path/to/ClawQL/scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8080
export CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
```

## Phases (cost discipline)

| Phase | Model | Scope |
|---|---|---|
| A–D | Sonnet (OpenRouter) | 1→few tasks, isolation, prompt |
| E | Opus both arms | Publishable ledger |
| Judge | Sonnet | Always |

## Results ledgers

- `docs/benchmarks/harvey-lab-baseline.md`
- `docs/benchmarks/harvey-lab-clawql-results.md`
- `docs/benchmarks/harvey-lab-pause-handoff.md`

Do not outreach to Harvey until the Opus two-arm ledger exists.
