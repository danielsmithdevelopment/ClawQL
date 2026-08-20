# clawql-data

Structured data for ClawQL: **Node DuckDB** plus MCP **`data_query`** / **`data_ingest`** / **`data_status`**.

This is a TypeScript package. It does **not** use Python `duckdb` and it does **not** use chDB (ClickHouse-in-process, a Python package).

## Enable

```bash
CLAWQL_ENABLE_DATA=1
# optional: file path (default `$CLAWQL_OBSIDIAN_VAULT_PATH/lab/matters.duckdb` or `:memory:`)
# CLAWQL_DATA_PATH=/path/to/matters.duckdb
# CLAWQL_DATA_ENGINE=duckdb
```

`CLAWQL_DATA_ENGINE=chdb` (or `python`) is rejected on purpose.

## MCP tools

| Tool | Purpose |
| --- | --- |
| **`data_query`** | Read-only SQL (`SELECT` / `WITH` / `DESCRIBE` / `SHOW` / `SUMMARIZE`) |
| **`data_ingest`** | Load `matters` / `matter_documents` / `open_facts`; optional `mattersRoot` filesystem walk |
| **`data_status`** | Engine (`duckdb`) + database path |

Document inventory classification (`doc_type`, lock-up days, offering withdrawal dates) runs in this package, not in the Harvey LAB Python adapter.
