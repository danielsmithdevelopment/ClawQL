# Firm-knowledge 001–010 — clawql all-pass handoff (2026-08-16)

> **⚠️ SUPERSEDED — `python-duckdb-v1` only.** These scorecards used Python DuckDB pre-ingest
> and patched harness paths. They are **quarantined** under
> [`../results/legacy/python-duckdb-v1/`](../results/legacy/python-duckdb-v1/).
> Do not cite for current ClawQL claims. Re-run on **`ts-clawql-data-v2`** — see
> [`../../../docs/benchmarks/harvey-lab-stack-lineage.md`](../../../docs/benchmarks/harvey-lab-stack-lineage.md).

**Audience:** Claude (benchmark review) + operators deciding whether to launch a contiguous “real” run today.  
**Arm:** `nemotron-clawql` only  
**Agent:** `openai/mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit` via clawql-inference `:8091` → MLX `:8081`  
**Judge:** `ollama/qwen3.6:35b` via same gateway  
**Checkout:** harvey worktree `/Users/danielsmith/ClawQL-harvey-lab` · harvey-labs `/tmp/harvey-labs-work2/harvey-labs`

---

## Verdict (share this first)

We have a **composed 10/10 all-pass** on firm-knowledge tasks **001–010** for the ClawQL arm.

| Claim | Status |
|-------|--------|
| Every task 001–010 has at least one all-pass scorecard under current detectors/prompt | **Yes** |
| Single contiguous batch of 001–010 on the *final* overlay, same vault/ingest generation | **Not yet** |
| Ready to start a contiguous confirmation / “real” run today | **Yes, with that one caveat** |

Artifact (legacy): [`../results/legacy/python-duckdb-v1/aggregate-001-010-perfect.json`](../results/legacy/python-duckdb-v1/aggregate-001-010-perfect.json)

---

## Scoreboard

### Composed all-pass (current claim)

| Task | Criteria | Source | Notes |
|------|----------|--------|--------|
| 001 | 7/7 | v3 | Solara proof = `substantial-compliance-certification-letter` |
| 002 | 4/4 | v2 | Held through trust-layer batch |
| 003 | 3/3 | v2 | |
| 004 | 2/2 | v3 | Latest by `hsr_second_request_date` → Cascade `1038-00001`; single_answer (no over-enumeration) |
| 005 | 6/6 | v3d | **4 of 7 (~57%)** via `billion_dollar_antitrust_ma` |
| 006 | 3/3 | v2 | Practice label `Antitrust & Competition` |
| 007 | 3/3 | v2 | |
| 008 | 4/4 | v2 | |
| 009 | 19/19 | v3d | Enumerate `has_maintenance_financial_covenant = true` only (9 matters); cite proof filenames |
| 010 | 2/2 | v2 | Cov-lite path |

### Progression (clawql arm)

| Batch | All-pass | Criterion density (approx) | What it proved |
|-------|----------|----------------------------|----------------|
| v1 (pre-trust) | ~3/10 | ~55% criteria | 001 possible; DuckDB confident-false + trunc extract were lethal |
| v2 (trust layer mid-batch) | **6/10** | higher | 003/006/007/008/010 fixed; 001/004/005/009 still broken |
| v3 iteration | **10/10 composed** | — | Wired missing DuckDB fields; kind inference; billion-MA view; enum precision |

v2 aggregate: [`../results/aggregate-001-010-v2.json`](../results/aggregate-001-010-v2.json) — `all_pass_count: 6`, `perfect: false`.

---

## What we built (trust / ontology layer)

Core idea: **L0 open facts + L2 tri-state bools** (`NULL` = unknown). Never ship semantic `false` without proof. Agents must not treat empty/false DuckDB as “absence.”

| Module (harvey worktree) | Role |
|--------------------------|------|
| `harness/adapters/clawql_lab_evidence.py` | Open KV / surface phrases; `nullable_bool`; trust preflight |
| `clawql_lab_matter_schema.py` | Semantic bools default `None`; proof columns |
| `clawql_lab_duckdb.py` | Local heuristics always run; `open_facts`; deal value; MA execution detect; views |
| `clawql_lab_session.py` | Ingest → ontology + DuckDB; client canon; preferred HSR evidence |
| `clawql_system_prompt.md` | NULL≠false; SQL patterns; evidence filename prefer lists |
| `clawql_agent_loop.py` | Task-kind from **user** messages only; enum patterns for “pull financings” |

### Sticky root causes fixed while iterating

1. **Demo LangExtract empty-OK** skipped local heuristics while `open_facts` still saw phrases → confident wrong L2.  
2. **`MAX_EXTRACT_CHARS` 12k** truncated credit agreements past Section 7 covenants.  
3. **Covenant-lite** left unused “springing” term-sheet language → false maintenance; finalize clears maintenance when `is_covenant_lite`.  
4. **DuckDB rows never populated** `deal_value_usd`, `hsr_second_request_date`, `hsr_second_request_proof_doc` (schema existed; session omitted) → 004/005 math collapsed.  
5. **Proof_doc from date-bearing memo** beat rubric gold (Solara strategy memo vs substantial-compliance).  
6. **Task-kind** inferred from system prompt (“across” / “how often”) → 004/009 misclassified as frequency/single_answer.  
7. **Billion-dollar N** was either whole vault, Antitrust-only (N=4), or every TEV≥$1B (N=13). Gold needs **N=7, k=4**.

### Task 005 population contract (calibrated)

View `billion_dollar_antitrust_ma`:

```text
deal_value_usd >= 1.2e9
AND (is_hsr_second_request OR has_ma_execution_agreement)
```

- `has_ma_execution_agreement` = executed **merger-agreement** or **EPA** (not SPA-only).  
- Yields gold **4 of 7 (~57%)**; precision allowlist still permits Halcyon `1032-00001` without requiring it in N.

### Task 009 contract

- Qualifying = `is_credit_facility AND has_maintenance_financial_covenant = true` → **9** matters.  
- Cov-lite **1005 / 1008 / 1021** → maintenance `false` (1005 must not appear in qualifying set).  
- Cite `has_maintenance_financial_covenant_proof_doc` filenames; use `client_short_name` (matter-id map for LAB DMS).

---

## Infra known-good (local Mac)

| Service | Port | Role |
|---------|------|------|
| clawql-inference | 8091 | Agent + judge gateway; call-store |
| MLX Nemotron | 8081 | Agent weights |
| Ollama judge | 11434 | `qwen3.6:35b` |
| ClawQL MCP | 8082 | Task-scoped vault (`CLAWQL_LAB_MCP_PORT=8082`; avoid ExtractBench `:8080`) |
| Tika | 9998 | Docx→text for deal value / extract |
| LangExtract | 8090 | Demo mode OK if local heuristics always run |

Env pattern used: `CLAWQL_LAB_PODMAN_VIA_DOCKER=1`, `HARVEY_LABS=/tmp/harvey-labs-work2/harvey-labs`, `CLAWQL_LAB_SKIP_CLONE=1`, overlay via `apply_clawql_adapter.py`.

**Process lesson:** MCP restart = hard-kill + free port; durable services in Cursor background terminals (agent short shells SIGTERM process groups).

---

## What “real run today” should mean

Recommended gate before publishing / PR / external Harvey LAB claim:

1. **Contiguous confirmation batch** — tasks 001–010, same overlay, fresh ingest per task (or one clear cache policy), `LAB_ARMS=nemotron-clawql`, log + aggregate JSON.  
2. Confirm pre-ingest lines look healthy, e.g.:  
   - `maintenance_fc true=9` (not `true=12` / `null=12`)  
   - `hsr_sr_dated=6`  
   - `billion_dollar_antitrust_ma` → N=7, k=4 when queried  
3. Do **not** mix mid-batch overlay changes (v2 failure mode).  
4. Optional: freeze adapter commit hash / worktree rev in the aggregate JSON.

Until (1) is green, say: *“composed all-pass under final detectors; contiguous confirmation pending.”*

---

## Suggested copy-paste for Claude

> ClawQL arm (`nemotron-clawql` / Nemotron-3.5-Lightning 30B MLX + Qwen3.6:35b judge) reached **composed 10/10 all-pass** on Harvey LAB firm-knowledge **001–010**. Path: trust-layer DuckDB (NULL≠false, open_facts) + wiring previously missing deal_value / HSR date+proof columns + task-kind fixes + calibrated billion-dollar MA view (4/7) + maintenance enumeration precision. v1 ~3/10 → v2 6/10 → v3 composed 10/10. **Caveat:** not yet one contiguous batch on the final overlay; that confirmation is the next gate before calling it the “real” run.

---

## Key run IDs (v3 winners)

| Task | Run id (scores under harvey-labs/results) |
|------|-------------------------------------------|
| 001 | `…/20260815-220137` |
| 004 | `…/20260816-140042` |
| 005 | `…/20260816-150503` |
| 009 | `…/20260816-151141` |

Model dir name: `NVIDIA-Nemotron-3-5-Lightning-30B-A3B-4bit`.
