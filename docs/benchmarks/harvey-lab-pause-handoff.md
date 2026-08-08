# Harvey LAB × ClawQL — pause / resume handoff

**Paused:** 2026-08-08  
**Branch / PR:** `cursor/harvey-lab-firm-knowledge-4ff0` → [#881](https://github.com/danielsmithdevelopment/ClawQL/pull/881)  
**Do not outreach Harvey** until an Opus-vs-Opus firm-knowledge ledger exists.

## Goal (unchanged)

Run ClawQL against Harvey LAB [`firm-knowledge`](https://github.com/harveyai/harvey-labs) (250 tasks, shared Calderwood & Harkness DMS) and record **criterion pass rate** + **all-pass rate** with Harvey’s rubric judge. Same model both arms for a valid comparison.

## Decision locked in before pause

| Topic | Decision |
|---|---|
| Where to run | **GitHub Actions**, same as OpenBench — use repo secret `OPENROUTER_API_KEY` |
| Not Cursor Cloud Agent | Cloud Agent pods do **not** inherit GHA secrets; do not block on Cursor env keys |
| Debug model | Sonnet via OpenRouter (`claude-sonnet-4-6` → `anthropic/claude-sonnet-4.6`) |
| Publishable model | Opus both arms (OpenRouter Anthropic ids) |
| Judge | Sonnet |
| Vault isolation | Task-scoped vault; delete/recreate between tasks |
| DMS ingest | Priority docs per matter (closing / engagement / HSR / second-request), not all ~9k binaries |
| Cost note | **250** firm-knowledge tasks (not ~50) — gate full Opus sweep |

## What’s already landed (in #881 / tree)

| Path | Status |
|---|---|
| `integrations/harvey-labs/harness/adapters/clawql.py` | Adapter + MCP tools + pre-ingest/cleanup |
| `integrations/harvey-labs/harness/adapters/clawql_openrouter.py` | OpenRouter Anthropic client (GHA) |
| `integrations/harvey-labs/harness/clawql_tools.py` | Routes `clawql_*` → MCP |
| `integrations/harvey-labs/scripts/apply_clawql_adapter.py` | Copies overlay + patches `run.py` / Anthropic / judge |
| `integrations/harvey-labs/scripts/run-lab-gha.sh` | GHA entrypoint (clone LAB, both arms, scorecard) |
| `integrations/harvey-labs/scripts/phase-a-single-task.sh` | Local helper (secondary) |
| `scripts/start-clawql-for-lab.sh` | Task-scoped MCP + vault |
| `integrations/harvey-labs/tests/test_vault_isolation.py` | Unit tests (pass) |
| `docs/benchmarks/harvey-lab-baseline.md` | Ledger stub |
| `docs/benchmarks/harvey-lab-clawql-results.md` | Ledger stub |

## Verified before pause

- Harvey LAB docs read; task `firm-knowledge/tasks/001` inspected (11 criteria)
- `uv sync`, Podman 4.9.3, `lab-sandbox:latest`, sandbox smoke OK
- ClawQL MCP smoke: ingest 2 matters + `memory_recall` OK (protocol `2025-11-25`; body via `toolOutputs`, not `content`)
- Isolation unit tests pass

## Not done (resume here)

1. **Ship GHA workflow** `.github/workflows/harvey-lab-firm-knowledge.yml`  
   - `workflow_dispatch` only (cost control)  
   - Inputs: `task`, `model`, `max_turns`, `arms`  
   - Secrets: `OPENROUTER_API_KEY` (required), same OpenRouter headers as OpenBench  
   - Steps: checkout ClawQL → `bash integrations/harvey-labs/scripts/run-lab-gha.sh` → upload scorecard + run artifacts  
2. **Phase A (Sonnet):** `firm-knowledge/tasks/001`, arms `baseline,clawql`, `LAB_MAX_TURNS=15`  
3. **Phases B–D:** 5-task sample, vault isolation live check, prompt tune — still Sonnet  
4. **Phase E:** Opus vs Opus full (or staged) firm-knowledge sweep  
5. Fill `harvey-lab-baseline.md` + `harvey-lab-clawql-results.md`  
6. Optional: RTP/OBT Cloudflare traces with `community_model` consent on every run  

## Resume commands

```bash
# After workflow exists — Phase A
gh workflow run harvey-lab-firm-knowledge.yml \
  -f task=firm-knowledge/tasks/001 \
  -f model=claude-sonnet-4-6 \
  -f max_turns=15 \
  -f arms=baseline,clawql

# Apply overlay locally (optional debug)
python integrations/harvey-labs/scripts/apply_clawql_adapter.py \
  --harvey-labs /path/to/harvey-labs
export CLAWQL_LAB_USE_OPENROUTER=1
export OPENROUTER_API_KEY=…   # from GHA / local only — never commit
./scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8080
```

## Related OpenBench (mechanism, not LAB scores)

| Cell | Evidence | Note |
|---|---|---|
| B-7.1 fair / ontology | prior CI runs | Synthetic fixture wins |
| B-7.1-blind / B-7.2 | PR #878 | Preference + blind |
| B-7.3 amortized | PR #880 | Multi-question session |
| B-7.4 full C&H corpus | blocked | Need stable full corpus download; LAB DMS is the real firm corpus for LAB scores |

## Anti-patterns

- Do not treat OpenBench B-7 synthetic wins as Harvey LAB results  
- Do not compare Sonnet vs Opus across arms  
- Do not run Phase E until Phases A–D are clean  
- Do not rely on Cursor Cloud Agent secrets for LAB inference  
