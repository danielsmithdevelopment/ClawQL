# Harvey LAB stack lineage

**Updated:** 2026-08-20

Harvey LAB × ClawQL has two distinct measurement stacks. Mixing them invalidates benchmark claims and poisons fine-tune traces.

## Current — `ts-clawql-data-v2`

| Component      | Implementation                                                                      |
| -------------- | ----------------------------------------------------------------------------------- |
| Pre-ingest     | `integrations/harvey-labs/scripts/lab-pre-ingest.mjs`                               |
| Vault seed     | `integrations/harvey-labs/scripts/lab-vault-seed.mjs`                               |
| MCP I/O        | `integrations/harvey-labs/scripts/lab-mcp-proxy.mjs`                                |
| Structured SQL | MCP `data_query` / `data_ingest` via `packages/clawql-data` (Node DuckDB)           |
| Memory enrich  | `packages/clawql-memory/src/recall/harvey-lab-enrich.ts` when `CLAWQL_HARVEY_LAB=1` |
| Harness glue   | Python adapter subclasses + `run.py` marker blocks only                             |
| Harvey diff    | **Zero** changes to upstream `agent_loop.py`                                        |

Pre-ingest fingerprint:

```text
ClawQL pre-ingest: Node DuckDB … matters=… documents=… open_facts=…
```

Canonical metadata: [`integrations/harvey-labs/stack-version.json`](../../integrations/harvey-labs/stack-version.json).

## Legacy — `python-duckdb-v1` (quarantined)

| Component  | Implementation                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pre-ingest | Python `_build_lab_duckdb` (removed)                                                                                           |
| SQL path   | Local Python DuckDB file under task vault                                                                                      |
| Harness    | Optional `clawql_agent_loop.py` patch (removed)                                                                                |
| Artifacts  | [`integrations/harvey-labs/results/legacy/python-duckdb-v1/`](../../integrations/harvey-labs/results/legacy/python-duckdb-v1/) |

Pre-ingest fingerprint:

```text
ClawQL pre-ingest: DuckDB /path/…/matters.duckdb rows=266 …
```

**Do not** cite these scorecards as current ClawQL performance. **Do not** merge associated call-store JSONL into training buckets.

## Trace taint matrix

| Artifact                                       | Tainted for TS stack? | Notes                          |
| ---------------------------------------------- | --------------------- | ------------------------------ |
| Legacy scorecards / aggregates                 | Yes                   | Wrong pre-ingest + tool path   |
| Harvey `transcript.jsonl` from legacy runs     | Yes (comparison)      | Tool results from Python stack |
| Local `HarveyLAB/call-store/*.jsonl` before v2 | Yes (training)        | LLM turns OK; tool obs wrong   |
| GHA Harvey matrix scorecards (OpenRouter)      | Yes if pre-v2 branch  | No call-store from GHA         |
| OpenBench B-7 / openbench-ab traces            | No                    | Separate pipeline              |

## Recovery

1. Remove [`integrations/harvey-labs/.skip-lab-matrix`](../../integrations/harvey-labs/.skip-lab-matrix) after clean baseline passes.
2. Re-run contiguous 001–025: `bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh`
3. Tag all new artifacts with `"stack_version": "ts-clawql-data-v2"`.
4. Keep legacy files in `results/legacy/` for archaeology only.

## Related

- [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md)
- [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)
- [`../design/harvey-lab-duckdb-retrieval.md`](../design/harvey-lab-duckdb-retrieval.md)
