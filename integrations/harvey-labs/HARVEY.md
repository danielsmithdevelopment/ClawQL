# Harvey LAB × ClawQL — contract

**Audience:** Harvey (or anyone cloning harvey-labs to run ClawQL).  
**Rule:** We do not change your benchmark core. Our job is to not fuck that up.

## What you do

```bash
git clone https://github.com/harveyai/harvey-labs.git
git clone https://github.com/danielsmithdevelopment/ClawQL.git

# Start ClawQL MCP (task-scoped vault + Node DuckDB)
bash ClawQL/scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8080
export CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
export CLAWQL_LAB_PREINGEST_SCRIPT="$PWD/ClawQL/integrations/harvey-labs/scripts/lab-pre-ingest.mjs"
export CLAWQL_LAB_MCP_PROXY="$PWD/ClawQL/integrations/harvey-labs/scripts/lab-mcp-proxy.mjs"

# Apply overlay — copies OUR files + minimal run.py hooks only
python3 ClawQL/integrations/harvey-labs/scripts/apply_clawql_adapter.py \
  --harvey-labs "$PWD/harvey-labs"

cd harvey-labs && uv sync
uv run python -m harness.run \
  --model clawql-cc/nvidia/nemotron-3.5-lightning \
  --task firm-knowledge/tasks/001 \
  --max-turns 40
```

## What changes in your tree

| Path | Who owns it | Change |
| ---- | ----------- | ------ |
| `harness/adapters/clawql*.py` | **ClawQL** (new) | Copied in |
| `harness/adapters/openrouter_chat.py` | **ClawQL** (new) | Copied in |
| `harness/clawql_tools.py` | **ClawQL** (new) | Copied in |
| `evaluation/clawql_openrouter_judge.py` | **ClawQL** (new) | Copied in |
| `harness/run.py` | Harvey | **Marker blocks only** — register `clawql` / `clawql-cc` providers + ClawQL tool executor when those models are used |
| `harness/agent_loop.py` | Harvey | **Never touched** |
| `harness/adapters/anthropic.py` | Harvey | **Never touched** (default apply) |
| `evaluation/judge.py` | Harvey | **Never touched** (default apply) |
| `evaluation/run_eval.py` | Harvey | **Never touched** (default apply) |

Baseline / stock Harvey models keep your normal path. ClawQL only activates for `clawql/…` and `clawql-cc/…`.

## What we deliberately do not do

- Patch `agent_loop.py` (deliverable guards, task-kind hacks, etc.)
- Put DuckDB / vault / ontology product logic in Python
- Rewrite your Anthropic adapter or judge for normal Harvey runs

ClawQL product (SQL, vault, memory) runs in **Node / EffectTS** behind MCP. The Python adapter is thin glue that calls `lab-mcp-proxy.mjs`.

## Optional ClawQL-only flag

`--openrouter-hooks` patches your `anthropic.py` / `judge.py` / `run_eval.py` so ClawQL’s **own** GHA can route through OpenRouter without Anthropic. **Harvey should not use this.** Default apply leaves those files stock.

## Stack tag

Current ClawQL stack: `ts-clawql-data-v2` — see [`stack-version.json`](stack-version.json).

## LAB rules / submission hygiene

Full checklist: [`docs/benchmarks/harvey-lab-rules-compliance.md`](../../docs/benchmarks/harvey-lab-rules-compliance.md).

Short version:

- **Baseline arm** = your six tools + same model + same judge (model / stock harness claim).
- **ClawQL arm** = agent-stack claim (extra `clawql_*` tools + Node pre-ingest). Always pair with baseline.
- Headline metric = **all-pass**; CPR is diagnostic only.
- Publishable judge = **`claude-sonnet-4-6`** (Harvey default). OpenRouter mini / local Ollama judges are debug only.
- Do not cite `python-duckdb-v1` or pre-`ts-clawql-data-v2` scorecards as current ClawQL performance.
