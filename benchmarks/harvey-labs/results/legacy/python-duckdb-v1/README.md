# Legacy Harvey LAB results — python-duckdb-v1

**Do not use** for publishable ClawQL claims, stack comparisons, or fine-tune datasets.

| Field | Value |
| ----- | ----- |
| `stack_version` | `python-duckdb-v1` |
| Pre-ingest | Python `_build_lab_duckdb` in deleted `clawql_lab_session.py` |
| SQL path | Python-built `matters.duckdb` + in-process or sidecar queries |
| Harness | May include patched `clawql_agent_loop.py` / deliverable-guard hooks |
| Superseded by | `ts-clawql-data-v2` (see `../../stack-version.json`) |

Pre-ingest fingerprint: log lines containing `ClawQL pre-ingest: DuckDB … rows=266`.

Domain discoveries from this era (HSR flags, maintenance_fc NULL semantics, gold IDs) were ported to Node — the **numbers** here are not comparable to the TS stack without a full re-run.
