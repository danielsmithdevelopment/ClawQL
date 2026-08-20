# Harvey LAB — `ts-clawql-data-v2` smoke gate

**Status:** Contiguous 001–025, Harvey outreach, training flywheel, and any publishable / PragmaticVectors LAB numbers are **blocked** until this gate is green.

Architectural work (clawql-audit, agents specs, homelab docs, benchmark _design_) does **not** depend on this gate.

**Ground truth (no inference):** firm-knowledge SQL oracles are **25/25** on Node DuckDB / EffectTS (`sql-gold-001-025.mjs`). That proves answers are recoverable via SQL on the correct stack. This gate proves the **agent** reaches them through MCP (`clawql_sql`) on Mac mini MLX.

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

---

## Mac mini (MLX) — copy/paste operator guide

Adjust `CLAWQL` clone path and `HARVEY_LABS` if yours differ. Default clone path below: `~/src/ClawQL`.

### 0. Pull main + build

```bash
cd ~/src/ClawQL
git checkout main && git pull origin main
npm ci
npm run build
test -f dist/server-http.js && test -f packages/clawql-data/dist/index.js && echo BUILD_OK
```

### 1. Services (three terminals)

**T1 — MLX Nemotron (must listen on :8081)**

```bash
# Start mlx_lm.server with Nemotron-3.5 Lightning 4bit as you normally do.
# Confirm:
curl -fsS http://127.0.0.1:8081/v1/models | head
```

**T2 — clawql-inference (:8091 → MLX agent + Ollama judge)**

```bash
cd ~/src/ClawQL
export CLAWQL_LAB_RUN_ID=harvey-lab-ts-v2-smoke-$(date +%Y%m%d)
bash integrations/harvey-labs/scripts/start-clawql-inference-for-lab.sh 8091 "$CLAWQL_LAB_RUN_ID"
```

Do **not** point the harness at raw MLX — that skips the call-store flywheel.

**T3 — Ollama judge** (if not already up)

```bash
curl -fsS http://127.0.0.1:11434/api/tags | head
# Local default judge model: ollama/qwen3.6:35b
```

### 2. Preflight + quarantine

```bash
cd ~/src/ClawQL
export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1            # if clone + firm-knowledge DMS already present
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1     # Mac: podman→Docker Desktop shim

bash integrations/harvey-labs/scripts/preflight-ts-v2-smoke.sh
bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh
```

### 3. Gate: task 001 only (`nemotron-clawql`)

```bash
cd ~/src/ClawQL
export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1
export CLAWQL_LAB_RUN_ID="${CLAWQL_LAB_RUN_ID:-harvey-lab-ts-v2-smoke}"
export LAB_TASK=firm-knowledge/tasks/001
export LAB_ARMS=nemotron-clawql

bash integrations/harvey-labs/scripts/run-lab-local.sh
```

`run-lab-local.sh` starts ClawQL MCP from **built** `dist/` via `start-clawql-for-lab.sh` (npx is refused when `CLAWQL_ENABLE_DATA=1`).

### 4. Pass criteria (both required)

```bash
# A) Node DuckDB fingerprint (NOT legacy "DuckDB … rows=266")
rg -n "ClawQL pre-ingest: Node DuckDB" /tmp/harvey-labs-work*/**/* 2>/dev/null | head
# Also check the run log path printed by run-lab-local.sh

# B) clawql_sql in call-store
HOME_DIR="${CLAWQL_HOME:-$HOME/.ClawQL}"
rg -l "clawql_sql" "$HOME_DIR/HarveyLAB/call-store/" 2>/dev/null | head
rg "clawql_sql" "$HOME_DIR/HarveyLAB/call-store/runs/${CLAWQL_LAB_RUN_ID}/calls.jsonl" 2>/dev/null | head
```

**Fail if:** legacy Python ingest line, or no `clawql_sql` (bash/grep only).

When both are green, paste the fingerprint line + one `clawql_sql` call-store snippet into the thread before starting contiguous.

### 5. Only if gate green — contiguous 001–025

```bash
cd ~/src/ClawQL
export HARVEY_LABS="${HARVEY_LABS:-/tmp/harvey-labs-work2/harvey-labs}"
export CLAWQL_LAB_SKIP_CLONE=1
export CLAWQL_LAB_PODMAN_VIA_DOCKER=1
export CLAWQL_LAB_RUN_ID=harvey-lab-contiguous-ts-v2-$(date +%Y%m%d)

bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
# → integrations/harvey-labs/results/ts-v2/aggregate-contiguous-001-025.json
```

### Short checklist (same flow)

```bash
bash integrations/harvey-labs/scripts/preflight-ts-v2-smoke.sh
bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh
npm run build   # if preflight complained about dist
# services: MLX :8081, clawql-inference :8091, Ollama :11434
LAB_TASK=firm-knowledge/tasks/001 LAB_ARMS=nemotron-clawql \
  bash integrations/harvey-labs/scripts/run-lab-local.sh
# inspect fingerprint + clawql_sql — then:
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
```

---

## Likely smoke failures

| Symptom                                       | Likely cause                 | Fix                                                                                                                                            |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `matters.duckdb rows=266` line         | npx fallback / old overlay   | `npm run build`; confirm `dist/server-http.js`; restart MCP (`start-clawql-for-lab.sh` **exits** if dist missing under `CLAWQL_ENABLE_DATA=1`) |
| Fingerprint OK, no `clawql_sql` in call-store | MCP proxy / tool merge / env | `CLAWQL_LAB_MCP_PROXY` → `lab-mcp-proxy.mjs`; `CLAWQL_MCP_URL`; overlay applied for `clawql-cc/…`                                              |
| `data_ingest` / `CLAWQL_ENABLE_DATA!=1`       | MCP started without data     | `CLAWQL_ENABLE_DATA=1` in `start-clawql-for-lab.sh` (default on) + rebuild                                                                     |
| Pre-ingest can’t find matters                 | Wrong DMS path               | `CLAWQL_LAB_DOCUMENTS_DIR` set from task `docs_dir` in overlay `run.py`                                                                        |
| `clawql-inference not reachable`              | T2 not up / MLX down         | Start MLX :8081 first, then `start-clawql-inference-for-lab.sh 8091 …`                                                                         |
| Wrong harvey path                             | Clone / DMS missing          | Set `HARVEY_LABS=…`; confirm `tasks/firm-knowledge/dms/matters`                                                                                |

## After contiguous is green

1. Commit/push `results/ts-v2/aggregate-contiguous-001-025.json` with `"stack_version": "ts-clawql-data-v2"`.
2. Remove `integrations/harvey-labs/.skip-lab-matrix` when ready to resume GHA matrix.
3. Re-open: Harvey outreach, training on **new** call-store only, PV posts citing LAB numbers, 026–050 held-out — all on v2 artifacts only.
4. Publishable external claims still need judge `claude-sonnet-4-6` (or dual); Ollama judge is internal baseline only.

## Related

- [`harvey-lab-stack-lineage.md`](harvey-lab-stack-lineage.md)
- [`harvey-lab-rules-compliance.md`](harvey-lab-rules-compliance.md)
- [`integrations/harvey-labs/HARVEY.md`](../../integrations/harvey-labs/HARVEY.md)
- [`integrations/harvey-labs/README.md`](../../integrations/harvey-labs/README.md)
- SQL ground truth (no inference): `integrations/harvey-labs/scripts/sql-gold-001-025.mjs`
