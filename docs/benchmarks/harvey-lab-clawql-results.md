# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-08  
Model: **pending Opus both arms** (`claude-opus-4-6` via OpenRouter)  
Tasks: 250  
Judge: `claude-sonnet-4-6`

## Status

**Paused.** Scaffolding + GHA/OpenRouter path are ready; live two-arm scores are not.  
Resume: [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md).

Publishable comparison requires **Opus vs Opus**. Sonnet is for Phases A–D only. Run in **GHA**, not Cursor Cloud Agent.

## Arm A — Baseline (standard harness)

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Mean turns          | _pending_ |
| Mean tokens         | _pending_ |

## Arm B — ClawQL (vault + MCP + priority DMS seed)

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Mean turns          | _pending_ |
| Mean tokens         | _pending_ |

## Delta

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Turn reduction      | _pending_ |
| Token reduction     | _pending_ |

## Per-task breakdown

| Task                     | Baseline CPR | ClawQL CPR | Delta | Baseline all-pass | ClawQL all-pass |
| ------------------------ | ------------ | ---------- | ----- | ----------------- | --------------- |
| firm-knowledge/tasks/001 | —            | —          | —     | —                 | —               |

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- GHA: `.github/workflows/harvey-lab-firm-knowledge.yml` + `scripts/run-lab-gha.sh`
- OpenRouter: `CLAWQL_LAB_USE_OPENROUTER=1` + `OPENROUTER_API_KEY`
- Startup: `scripts/start-clawql-for-lab.sh` (task-scoped vault)
- Isolation tests: `integrations/harvey-labs/tests/test_vault_isolation.py`
- Ontology LLM extraction off for benches

## Notes

Do not outreach to Harvey until this ledger has real Opus numbers for both arms.
