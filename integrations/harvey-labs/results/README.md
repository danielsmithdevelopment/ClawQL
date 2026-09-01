# Harvey LAB results — stack lineage

## Canonical stack (current)

**`ts-clawql-data-v2`** — see [`../stack-version.json`](../stack-version.json).

- Pre-ingest: `scripts/lab-pre-ingest.mjs` (Node MCP → `data_ingest`)
- Runtime tools: `scripts/lab-mcp-proxy.mjs` → MCP `data_query`, `memory_recall`, …
- Engine: `packages/clawql-data` (Node DuckDB plugin)
- Harness: marker blocks in `run.py` only; **no** `agent_loop.py` patch

New aggregates and scorecards **must** include `"stack_version": "ts-clawql-data-v2"`.

## Legacy (quarantined — do not use for publishable claims or training)

**`python-duckdb-v1`** — moved to [`legacy/python-duckdb-v1/`](legacy/python-duckdb-v1/).

These runs used Python `_build_lab_duckdb`, optional `clawql_agent_loop.py` patches, and/or pre-ingest log lines like `ClawQL pre-ingest: DuckDB … rows=266`. Judge scores remain valid **for that deprecated stack only**.

## Call-store / fine-tune traces

Local runs via `run-lab-local.sh` + `clawql-inference` append JSONL under `$CLAWQL_HOME/HarveyLAB/call-store/`. **Quarantine** any shard collected before `ts-clawql-data-v2` — tool observations reflect Python DuckDB, not MCP `data_query`.

GHA Harvey matrix runs do **not** write call-store (OpenRouter direct).

## Clean baseline rerun

```bash
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
```

Output: `results/ts-v2/aggregate-contiguous-001-025.json`
