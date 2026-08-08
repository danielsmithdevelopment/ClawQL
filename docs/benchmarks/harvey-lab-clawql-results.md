# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-08  
Model: **pending Opus both arms** (`claude-opus-4-6`)  
Tasks: 250  
Judge: `claude-sonnet-4-6`

## Status

Integration scaffolding is in `integrations/harvey-labs/`. Live two-arm scores are **not yet available** — blocked on `ANTHROPIC_API_KEY` after harness/Podman setup.

Publishable comparison requires **Opus vs Opus**. Sonnet is for Phases A–D only.

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

- Adapter: `integrations/harvey-labs/harness/adapters/clawql.py`
- Startup: `scripts/start-clawql-for-lab.sh` (task-scoped vault, Option A delete/recreate)
- Isolation unit tests: `integrations/harvey-labs/tests/test_vault_isolation.py`
- Firm-knowledge DMS is shared across tasks; seed ingest uses priority docs per matter (closing / engagement / HSR / second-request), not all ~9k binaries
- RTP/OBT: `audit` append on `LAB_RUN_START` with `consent=community_model` in summary; full Cloudflare OBT envelope wiring follows once runs execute
- Ontology LLM extraction off for benches (`CLAWQL_ONTOLOGY_LLM_EXTRACTION=0`)

## Blockers

1. `ANTHROPIC_API_KEY` required for agent + Sonnet judge
2. Full Opus sweep deferred until Phases A–D clean (cost discipline)

## Notes

Do not outreach to Harvey until this ledger has real Opus numbers for both arms.
