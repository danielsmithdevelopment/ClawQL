# clawql-data

Structured data MCP tools (`data_query`, `data_ingest`, `data_status`) behind **`CLAWQL_ENABLE_DATA=1`**.

## Architecture

- **Effect-TS** services (`src/effect/`) — same pattern as `clawql-sandbox`
- **Engine plugins** (`src/engines/`) — register via `registerDataEngine(id, factory)`; select with **`CLAWQL_DATA_ENGINE`**
- **`duckdb`** — first shipped engine plugin (`@duckdb/node-api`)

```bash
export CLAWQL_ENABLE_DATA=1
export CLAWQL_DATA_ENGINE=duckdb   # optional; default duckdb
export CLAWQL_DATA_PATH=/tmp/lab.duckdb
```

Harvey LAB vault pre-ingest: `integrations/harvey-labs/scripts/lab-pre-ingest.mjs` (Node, not Python).
