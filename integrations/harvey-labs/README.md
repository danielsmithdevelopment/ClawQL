# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

## What this provides

| Path | Purpose |
|---|---|
| `harness/adapters/clawql.py` | Anthropic adapter + MCP tools + pre-ingest / cleanup |
| `harness/adapters/clawql_system_prompt.md` | Recall-first guidance appended for ClawQL arm |
| `harness/clawql_tools.py` | Routes `clawql_*` tool calls to MCP |
| `scripts/apply_clawql_adapter.py` | Copies + patches into a harvey-labs checkout |
| `tests/test_vault_isolation.py` | Task-scoped vault isolation unit tests |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP HTTP startup |

## Firm-knowledge specifics

- Tasks live at `tasks/firm-knowledge/tasks/<id>/task.json`
- Documents are **shared**: `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest seeds **priority docs** (closing / engagement / HSR / second-request) per matter — not every binary
- Vault isolation is still **per task** (delete/recreate) so agent notes cannot leak across tasks

## Setup

```bash
git clone https://github.com/harveyai/harvey-labs.git
cd harvey-labs && ./scripts/setup.sh   # uv, pandoc, podman, sandbox image

# From ClawQL repo:
python integrations/harvey-labs/scripts/apply_clawql_adapter.py \
  --harvey-labs /path/to/harvey-labs

./scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8080
export CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
export ANTHROPIC_API_KEY=...
```

## Phase A (Sonnet debug) — single task both arms

```bash
cd /path/to/harvey-labs

# Arm A — baseline
uv run python -m harness.run \
  --model anthropic/claude-sonnet-4-6 \
  --task firm-knowledge/tasks/001 \
  --max-turns 15

# Arm B — ClawQL
uv run python -m harness.run \
  --model clawql/claude-sonnet-4-6 \
  --task firm-knowledge/tasks/001 \
  --max-turns 15
```

## Phase E (publishable) — Opus both arms

Only after Phases A–D are clean. Same model both arms. Judge remains Sonnet.

```bash
uv run python -m utils.sweep \
  --task firm-knowledge \
  --models anthropic/claude-opus-4-6 \
  --parallel 4

CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp \
uv run python -m utils.sweep \
  --task firm-knowledge \
  --models clawql/claude-opus-4-6 \
  --parallel 2
```

## Results ledgers (ClawQL repo)

- `docs/benchmarks/harvey-lab-baseline.md`
- `docs/benchmarks/harvey-lab-clawql-results.md`

Do not outreach to Harvey until the Opus two-arm ledger exists.
