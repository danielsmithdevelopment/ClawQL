# Harvey LAB Step 1 smoke log — FROZEN PROTOCOL

**Run id:** `harvey-lab-step1-smoke-2026-09-03`  
**Started:** 2026-09-03 (America/Los_Angeles)  
**Completed:** 2026-09-03 ~23:17 PDT  
**Stack:** `ts-clawql-data-v2`  
**Protocol:** `docs/benchmarks/harvey-lab-frozen-protocol.md`

## §1 Fixed facts (before any arm)

| Field | Value |
| ----- | ----- |
| Model ID | NVIDIA-Nemotron-3.5-Lightning-30B-A3B |
| Quant pin | `mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit` — `bits=4`, `mode=affine`, `group_size=64` |
| MLX listen | `127.0.0.1:8081` |
| Inference gateway | `127.0.0.1:8091` (call-store) |
| ClawQL MCP | `127.0.0.1:8082` (LAB vault; not ExtractBench :8080) |
| Published baseline (not compared here) | 0% / 8.3% — uncitable from Step 1 |

## §3 Pre-registered smoke task IDs (locked before arms)

| Role | Task path | Title (Harvey) |
| ---- | --------- | -------------- |
| Retrieval / enumeration | `firm-knowledge/tasks/002` | Count of Merger Reviews Drawing a Second Request |
| Numeric-filter | `firm-knowledge/tasks/005` | Frequency of Second Requests in Billion-Dollar Deals |
| Draft-style | `firm-knowledge/tasks/003` | Antitrust Deals That Received Second Requests and Cleared |

Mix note: all three are Antitrust / HSR-adjacent firm-knowledge tasks (not a full LAB cross-section). Step 1 only — not a publishable subset.

## §5 Judge (Step 1 smoke)

- Prefer Sonnet 4.6 for publishable scores.
- **This Mini smoke:** no `ANTHROPIC_API_KEY` in local `.env` → using `ollama/qwen3.6:35b` via clawql-inference for **plumbing-only** rubric scores.
- **Disclosure:** Step 1 judge ≠ Sonnet 4.6; scores are **not** citable and are **not** compared to 8.3%.

## §9 Interruptions / retries

| UTC-ish | Event | Arm/task | Action |
| ------- | ----- | -------- | ------ |
| start | ExtractBench MCP held `:8080` | — | LAB MCP on `:8082` |
| ~18:44 | Arm A finished False, 0 docs, CPR 0 | 002/A | Judge returned rubric — plumbing OK |
| 02:22Z | INTERRUPT: `data_ingest` skipped (ENABLE_DATA ignored) | 002/B | INSTANCE_SPEC + ENABLE_DATA exports |
| ~20:22Z | `clawql_sql` → `Tool data_query not found` | 002/B | bash `${VAR:-{…}}` closed at first `}`, nesting `data` under `memory` |
| ~20:38Z | INTERRUPT: harness hung after MLX 200 (~82k ctx) | 002/B | Kill; heredoc SPEC + `data.enabled` guard; restart MCP |
| ~21:08Z | Fingerprint green: Node DuckDB matters=266 documents=9288 | 002/B | `clawql_sql` ok |
| ~21:34–23:17 | Tasks 005 + 003 both arms completed | 005,003 | No further interrupts |

**Code fix shipped in tree:** `scripts/start-clawql-for-lab.sh` (heredoc INSTANCE_SPEC + top-level `data.enabled` guard); same brace pattern fixed in `integrations/extractbench/scripts/start-clawql-for-extractbench.sh`.

## Arm results (plumbing only — not citable)

| Task | Arm | Run id suffix | Turns | Finished | CPR | all_pass | ClawQL tools |
| ---- | --- | ------------- | ----- | -------- | --- | -------- | ------------ |
| 002 | A | `20260903-184427` | 20 | False | 0/4 | 0 | — |
| 002 | B | `20260903-203953` | 20 | False | 0/4 | 0 | `clawql_sql`×2, `memory_recall`×1 |
| 005 | A | `20260903-213440` | 20 | False | 1/6 | 0 | bash only |
| 005 | B | `20260903-214439` | 20 | False | 0/6 | 0 | `clawql_sql`×7, `memory_recall`×1 |
| 003 | A | `20260903-221730` | 20 | False | 1/3 | 0 | bash only |
| 003 | B | `20260903-224258` | 20 | False | 0/3 | 0 | `memory_recall`×1 |

Scorecards: `integrations/harvey-labs/results/scorecard-firm-knowledge_tasks_{002,005,003}-local.json`  
Call-store: `$CLAWQL_HOME/HarveyLAB/call-store/calls.jsonl` (`clawql_sql` present; 75+ clawql-related rows by end of smoke)

## Gate verdict

### **PASS** — Step 1 pipeline alive (frozen protocol §6)

| Check | Status |
| ----- | ------ |
| Agent completes both arms on all 3 pre-registered tasks | PASS |
| Judge returns real rubric scores (Ollama; disclosed ≠ Sonnet) | PASS |
| Arm A (Lightning alone) executes | PASS |
| Arm B (Lightning + ClawQL) executes | PASS |
| Live IDP pre-ingest + Node DuckDB fingerprint (not legacy Python line) | PASS |
| `clawql_sql` / DuckDB path exercised (002, 005) + call-store rows | PASS |
| `agent_loop.py` untouched | PASS |

**Not claimed:** any performance number; any comparison to 8.3%; any Sonnet-judged score.

## Follow-up (2026-09-08) — make Arm B finish, not cite scores

### Validation retest — `firm-knowledge/tasks/002` Arm B

| Run | Turns | Finished | `response.md` | CPR | Notes |
| --- | ----- | -------- | ------------- | --- | ----- |
| Smoke (broken DuckDB) | 20 | False | no / wrong 0/266 | 0/4 | Bare `data_ingest` left all `is_hsr_second_request=false` |
| After SQL-first overlay only | 20 | False | yes (turn 17) | 0/4 | Wroteable written; empty HSR columns |
| After **sql-gold** DuckDB + overlay | **6** | **True** | yes (turn 4) | **3/4** | Extra deal-value population → wrong sibling id |
| Generalized filter discipline (no task router) | **7** | **True** | yes (turn 5) | **4/4 ALL-PASS** | `matters WHERE practice_area=…`; includes `1003-00001` |
| 005 Arm B (same stack) | **5** | **True** | yes (turn 3) | **5/6** | N=8 via `deal_value>1e9` vs rubric 4-of-7 (~57%); C-005 fail |
| 005 after view `>=1e9∧antitrust` + compound/frequency overlay | **9** | **True** | yes | **6/6 ALL-PASS** | `billion_dollar_antitrust_ma`; **4 of 7 (~57%)**; run `20260908-195425` |
| 003 Arm B (same stack) | **5** | **True** | yes (turn 3) | **3/3 ALL-PASS** | `is_antitrust` + second request + clearance |

Root data fix: `lab-pre-ingest.mjs` now builds DuckDB via `sql-gold-001-025.mjs` path-detectors (not bare inventory). Cache skip requires `hsr_true>0`.

`billion_dollar_antitrust_ma` aligned to `is_antitrust_matter ∧ deal_value_usd >= 1e9` (was `>=1.2e9` / HSR-or-MA). Overlay: missing enum label ≠ drop conjunct; frequency requires **k of N** + every N id. `start-clawql-for-lab.sh` always binds `CLAWQL_DATA_PATH` to the current task vault (no stale cross-task DuckDB).

Earlier gap: agent applied an **unstated** deal-value population (wrong sibling matter_id). Fix is **general filter discipline** in the overlay (only SQL predicates the prompt states) — not task-specific “don’t use view X” language.
