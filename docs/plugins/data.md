---
title: Data
description: Node DuckDB structured SQL — data_query, data_ingest, data_status. CLAWQL_ENABLE_DATA=1.
slug: data
status: opt-in
package: clawql-data
order: 8
prev: sandbox
next: ouroboros
---

# Data

**Plugin ID:** `clawql-data`  
**Package:** `packages/clawql-data` — `DataPlugin`

Structured SQL via **pluggable data engine plugins** (`CLAWQL_DATA_ENGINE`, default `duckdb`). Effect-TS services in `packages/clawql-data`.

## MCP tools

| Tool              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| **`data_query`**  | Read-only SQL (`SELECT` / `WITH` / `DESCRIBE` / `SHOW` / `SUMMARIZE`)   |
| **`data_ingest`** | Load `matters` / `matter_documents` / `open_facts`; optional filesystem walk |
| **`data_status`** | Engine + database path                                                  |

## Enable

| Env                        | Default | Effect                                      |
| -------------------------- | ------- | ------------------------------------------- |
| **`CLAWQL_ENABLE_DATA=1`** | off     | Register `DataPlugin` and the `data_*` tools |
| **`CLAWQL_DATA_PATH`**     | vault `lab/matters.duckdb` or `:memory:` | Backend database path (engine-specific) |
| **`CLAWQL_DATA_ENGINE`**   | `duckdb` | Registered engine plugin id (`registerDataEngine`) |

Helm: `enableData: true`.
