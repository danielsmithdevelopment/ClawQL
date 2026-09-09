# Harvey LAB × ClawQL integration

Adapter overlay for [`harveyai/harvey-labs`](https://github.com/harveyai/harvey-labs) so ClawQL vault memory + MCP tools can be evaluated on the **`firm-knowledge`** task family (250 tasks, shared Calderwood & Harkness DMS).

> **Frozen protocol (2026-09-03):**  
> [`docs/benchmarks/harvey-lab-frozen-protocol.md`](../../docs/benchmarks/harvey-lab-frozen-protocol.md)  
> Matched **Lightning ± ClawQL** arms, live IDP ingest, Sonnet 4.6 judge, OpenRouter **paid** only for citable hosted runs. Older “three arms / free OpenRouter / local-vs-8.3%” framings are **superseded**.

**Stack:** `ts-clawql-data-v2` — Node pre-ingest + MCP `data_query`/`data_ingest` via [`packages/clawql-data`](../../packages/clawql-data). **No Python DuckDB.** See [`stack-version.json`](stack-version.json) and [`docs/benchmarks/harvey-lab-stack-lineage.md`](../../docs/benchmarks/harvey-lab-stack-lineage.md).

**Harvey:** Read [`HARVEY.md`](HARVEY.md) first. We never touch `agent_loop.py`. Default `apply_clawql_adapter.py` copies our adapters + minimal `run.py` hooks only.

## Matched Nemotron arms (publishable path)

| Arm | Model flag | Meaning | Needs Anthropic? |
| --- | ---------- | ------- | ---------------- |
| `nemotron` (protocol **Arm A**) | `openrouter/<nemotron>` or local MLX | Lightning **alone**, no ClawQL | **No** |
| `nemotron-clawql` (protocol **Arm B**) | `clawql-cc/<nemotron>` or local MLX + ClawQL | Lightning **+ ClawQL** | **No** |
| `baseline` / `clawql` | Claude | Opus/Sonnet (deferred; not Step 1–2 under frozen protocol) | Yes |

**Judges:** Engineering debug may use OpenRouter mini judges. **Publishable / Step 2 cite** scores must use **`claude-sonnet-4-6`**. See frozen protocol §5 and [`docs/benchmarks/harvey-lab-rules-compliance.md`](../../docs/benchmarks/harvey-lab-rules-compliance.md).

## Run path: GitHub Actions (preferred for Step 2)

Same as OpenBench: use repo secret **`OPENROUTER_API_KEY`** (**paid** tier — free models are disqualified under the frozen protocol). Do not depend on Cursor Cloud Agent env secrets.

Matrix sweeps are paused while `.skip-lab-matrix` exists (ts-v2 baseline validation). PR smoke (task 001) and `workflow_dispatch` still run.

```bash
# Example — replace free model id with a paid Lightning OpenRouter id before Step 2
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f arms=nemotron,nemotron-clawql \
  -f nemotron_model=<PAID_OPENROUTER_NEMOTRON_ID> \
  -f judge_model=anthropic/claude-sonnet-4-6 \
  -f max_turns=15 \
  -f max_matters=0
```

Pause / resume: [`docs/benchmarks/harvey-lab-pause-handoff.md`](../../docs/benchmarks/harvey-lab-pause-handoff.md)  
Stack lineage: [`docs/benchmarks/harvey-lab-stack-lineage.md`](../../docs/benchmarks/harvey-lab-stack-lineage.md)  
**Frozen protocol:** [`docs/benchmarks/harvey-lab-frozen-protocol.md`](../../docs/benchmarks/harvey-lab-frozen-protocol.md)

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
| `scripts/preflight-ts-v2-smoke.sh` | Build + path checks before task 001 smoke |
| `scripts/quarantine-legacy-call-store.sh` | Move pre-v2 call-store out of training path |
| `../../scripts/start-clawql-for-lab.sh` | Task-scoped vault + MCP (`CLAWQL_ENABLE_DATA=1`) |

Harvey harness diff: **zero** changes to upstream `agent_loop.py`.

## Firm-knowledge specifics

- Tasks: `tasks/firm-knowledge/tasks/<id>/task.json` (**250**)
- Documents: shared DMS via `docs_dir: "../../dms"` (~266 matters, ~9k files)
- Pre-ingest: Node `lab-pre-ingest.mjs` → vault + ontology + `data_ingest`
- Vault isolation is per task (delete/recreate)

## Local clean baseline (001–025)

**Blocked on smoke gate:** [`docs/benchmarks/harvey-lab-ts-v2-smoke-gate.md`](../../docs/benchmarks/harvey-lab-ts-v2-smoke-gate.md) — quarantine call-store, `npm run build`, task 001 with Node DuckDB fingerprint + `clawql_sql` in call-store, then contiguous.

```bash
bash integrations/harvey-labs/scripts/run-contiguous-001-025.sh
# → results/ts-v2/aggregate-contiguous-001-025.json
```

## Results

- **Current:** `results/ts-v2/` (after clean rerun)
- **Legacy (quarantined):** `results/legacy/python-duckdb-v1/` — do not publish or train on
- Ledgers: `docs/benchmarks/harvey-lab-*.md`

Do not outreach to Harvey until a **ts-clawql-data-v2** multi-task ledger exists with public Actions run IDs **and** publishable-judge (Sonnet 4.6) scores. Rules audit: [`docs/benchmarks/harvey-lab-rules-compliance.md`](../../docs/benchmarks/harvey-lab-rules-compliance.md).
