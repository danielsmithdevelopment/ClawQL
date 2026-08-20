# Harvey LAB — `ts-clawql-data-v2` smoke gate

**Status:** Contiguous 001–025, Harvey outreach, training flywheel, and any publishable / PragmaticVectors LAB numbers are **blocked** until this gate is green.

Architectural work (clawql-audit, agents specs, homelab docs, benchmark _design_) does **not** depend on this gate.

## Gate criterion (task 001)

Single local run of `firm-knowledge/tasks/001` must show:

1. Pre-ingest fingerprint:

   ```text
   ClawQL pre-ingest: Node DuckDB … matters=…
   ```

   **Fail** if you see the legacy Python line:

   ```text
   ClawQL pre-ingest: DuckDB …/matters.duckdb rows=266
   ```

   That usually means `dist/server-http.js` was missing and `start-clawql-for-lab.sh` fell back to `npx clawql-mcp` (published package has **no** `clawql-data`).

2. Call-store shows **`clawql_sql`** (MCP path via `lab-mcp-proxy.mjs`).  
   **Fail** if the agent only uses bash/grep for matter facts with no `clawql_*` tool rows — proxy / tool merge is broken regardless of the fingerprint line.

Only then run contiguous 001–025.

## Checklist

```bash
# 0. Preflight (build + script paths; warns if inference down)
bash integrations/harvey-labs/scripts/preflight-ts-v2-smoke.sh

# 1. Quarantine pre-v2 call-store — before collecting anything new
bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh

# 2. Build clawql-data into dist (required — clawql-data is not on npm)
npm run build
# Confirm: test -f dist/server-http.js
# Re-run preflight after build if step 0 failed on dist.

# 3. Inference stack (homelab)
#    MLX Nemotron :8081
#    clawql-inference :8091
#    Ollama judge
#    Podman or CLAWQL_LAB_PODMAN_VIA_DOCKER=1 shim
#    harvey-labs clone with firm-knowledge DMS
#    Optional: bash integrations/harvey-labs/scripts/start-clawql-inference-for-lab.sh 8091 <run_id>

# 4. ClawQL MCP from built dist (npx blocked when CLAWQL_ENABLE_DATA=1)
#    run-lab-local.sh calls start-clawql-for-lab.sh; or start manually:
bash scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8082

# 5. Task 001 smoke
export HARVEY_LABS=/path/to/harvey-labs   # if not default
export CLAWQL_LAB_SKIP_CLONE=1            # if clone already present
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1     # Mac docker shim if needed
LAB_TASK=firm-knowledge/tasks/001 \
LAB_ARMS=nemotron-clawql \
bash integrations/harvey-labs/scripts/run-lab-local.sh

# 6. Inspect gate
#    - agent/run log: Node DuckDB fingerprint
#    - $CLAWQL_HOME/HarveyLAB/call-store/*.jsonl: clawql_sql (and other clawql_*) rows

# 7. Only if green: contiguous
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
# → integrations/harvey-labs/results/ts-v2/aggregate-contiguous-001-025.json
```

## Likely smoke failures

| Symptom                                       | Likely cause                 | Fix                                                                                                                                            |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `matters.duckdb rows=266` line         | npx fallback / old overlay   | `npm run build`; confirm `dist/server-http.js`; restart MCP (`start-clawql-for-lab.sh` **exits** if dist missing under `CLAWQL_ENABLE_DATA=1`) |
| Fingerprint OK, no `clawql_sql` in call-store | MCP proxy / tool merge / env | `CLAWQL_LAB_MCP_PROXY` → `lab-mcp-proxy.mjs`; `CLAWQL_MCP_URL`; overlay applied for `clawql-cc/…`                                              |
| `data_ingest` / `CLAWQL_ENABLE_DATA!=1`       | MCP started without data     | `CLAWQL_ENABLE_DATA=1` in `start-clawql-for-lab.sh` (default on) + rebuild                                                                     |
| Pre-ingest can’t find matters                 | Wrong DMS path               | `CLAWQL_LAB_DOCUMENTS_DIR` set from task `docs_dir` in overlay `run.py`                                                                        |

## After contiguous is green

1. Commit/push `results/ts-v2/aggregate-contiguous-001-025.json` with `"stack_version": "ts-clawql-data-v2"`.
2. Remove `integrations/harvey-labs/.skip-lab-matrix` when ready to resume GHA matrix.
3. Re-open: Harvey outreach, training on **new** call-store only, PV posts citing LAB numbers, 026–050 held-out — all on v2 artifacts only.
4. Publishable external claims still need judge `claude-sonnet-4-6` (or dual); Ollama judge is internal baseline only.

## Related

- [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md)
- [`harvey-lab-rules-compliance.md`](harvey-lab-rules-compliance.md)
- [`integrations/harvey-labs/HARVEY.md`](../../integrations/harvey-labs/HARVEY.md)
