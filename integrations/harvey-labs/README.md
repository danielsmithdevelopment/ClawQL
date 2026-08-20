# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

**Stack:** `ts-clawql-data-v2` — Node pre-ingest + MCP `data_query`/`data_ingest` via [`packages/clawql-data`](../../packages/clawql-data). **No Python DuckDB.** See [`stack-version.json`](stack-version.json) and [`docs/benchmarks/harvey-lab-stack-lineage.md`](../../docs/benchmarks/harvey-lab-stack-lineage.md).

**Harvey:** Read [`HARVEY.md`](HARVEY.md) first. We never touch `agent_loop.py`. Default `apply_clawql_adapter.py` copies our adapters + minimal `run.py` hooks only.

## Three arms → Nemotron pair first

| Arm | Model flag | Meaning | Needs Anthropic? |
| --- | ---------- | ------- | ---------------- |
| `nemotron` | `openrouter/<nemotron>` | Nemotron, no ClawQL | **No** |
| `nemotron-clawql` | `clawql-cc/<nemotron>` | Nemotron + ClawQL | **No** |
| `baseline` / `clawql` | Claude | Opus/Sonnet A/B | Yes |

Publishable Claude A/B is Opus vs Opus (later). Nemotron pair compounds Harvey/Trajectory’s LAB post-train (published **8.3% all-pass**) with/without ClawQL retrieval — judge `openai/gpt-5.4-mini` via OpenRouter.

## Run path: GitHub Actions (preferred)

Same as OpenBench: use repo secret **`OPENROUTER_API_KEY`**. Do not depend on Cursor Cloud Agent env secrets.

Matrix sweeps are paused while `.skip-lab-matrix` exists (ts-v2 baseline validation). PR smoke (task 001) and `workflow_dispatch` still run.

```bash
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f arms=nemotron,nemotron-clawql \
  -f nemotron_model=nvidia/nemotron-3.5-lightning:free \
  -f judge_model=openai/gpt-5.4-mini \
  -f max_turns=15 \
  -f max_matters=0
```

Workflow defaults: **`nemotron,nemotron-clawql`** + **`openai/gpt-5.4-mini`** judge.

Pause / resume: [`docs/benchmarks/harvey-lab-pause-handoff.md`](../../docs/benchmarks/harvey-lab-pause-handoff.md)  
Stack lineage: [`docs/benchmarks/harvey-lab-stack-lineage.md`](../../docs/benchmarks/harvey-lab-stack-lineage.md)

## What this provides

| Path | Purpose |
| ---- | ------- |
| `harness/adapters/clawql.py` | Anthropic + MCP tools (minimal glue) |
| `harness/adapters/clawql_chat.py` | OpenRouter chat + ClawQL (Arm C) |
| `harness/adapters/clawql_lab_session.py` | Subprocess to Node MCP proxy (~100 lines) |
| `harness/adapters/clawql_tools.json` | Tool specs + MCP name map |
| `scripts/lab-pre-ingest.mjs` | Vault seed + MCP `data_ingest` (Node) |
| `scripts/lab-mcp-proxy.mjs` | Runtime MCP tool execution (Node) |
| `scripts/lab-vault-seed.mjs` | HSR / credit-facility detectors (Node) |
| `scripts/apply_clawql_adapter.py` | Copies overlay + `run.py` marker blocks only |
| `scripts/run-lab-gha.sh` | GHA entrypoint |
| `scripts/run-lab-local.sh` | Local MLX + clawql-inference + call-store |
| `scripts/run-contiguous-001-025.sh` | Clean baseline batch (ts-v2) |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP (`CLAWQL_ENABLE_DATA=1`) |

Harvey harness diff: **zero** changes to upstream `agent_loop.py`.

## Firm-knowledge specifics

- Tasks: `tasks/firm-knowledge/tasks/<id>/task.json` (**250**)
- Documents: shared DMS via `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest: Node `lab-pre-ingest.mjs` → vault + ontology + `data_ingest`
- Vault isolation is per task (delete/recreate)

## Local clean baseline (001–025)

```bash
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
# → results/ts-v2/aggregate-contiguous-001-025.json
```

## Results

- **Current:** `results/ts-v2/` (after clean rerun)
- **Legacy (quarantined):** `results/legacy/python-duckdb-v1/` — do not publish or train on
- Ledgers: `docs/benchmarks/harvey-lab-*.md`

Do not outreach to Harvey until a **ts-clawql-data-v2** multi-task ledger exists with public Actions run IDs.
