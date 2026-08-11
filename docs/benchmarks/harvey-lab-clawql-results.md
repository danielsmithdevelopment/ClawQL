# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-11  
Models: **pending** — Arm A/B Opus 4.8; Arm C Nemotron 3.5 Lightning + ClawQL  
Tasks: 250  
Judge: `claude-sonnet-4-6`

## Status

**Scaffolding ready; live scores pending GHA.**  
Resume: [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md) · Plan: [`harvey-lab-action-plan.md`](harvey-lab-action-plan.md).

Publishable A/B requires **Opus vs Opus**. Arm C (Nemotron + ClawQL) is compared to Harvey/Trajectory’s published **8.3% all-pass** for Nemotron 3.5 Lightning post-trained on LAB. Sonnet is for Phases A–D only. Run in **GHA**, not Cursor Cloud Agent.

## Arm A — Baseline (Opus, standard harness)

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Mean turns          | _pending_ |
| Mean tokens         | _pending_ |

## Arm B — Opus + ClawQL (vault + MCP + priority DMS seed)

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Mean turns          | _pending_ |
| Mean tokens         | _pending_ |

## Arm C — Nemotron 3.5 Lightning + ClawQL

| Metric                                    | Value     |
| ----------------------------------------- | --------- |
| Criterion pass rate                       | _pending_ |
| All-pass rate                             | _pending_ |
| Mean turns                                | _pending_ |
| Mean tokens                               | _pending_ |
| vs published Nemotron LAB (8.3% all-pass) | _pending_ |

## Delta (B − A)

| Metric              | Value     |
| ------------------- | --------- |
| Criterion pass rate | _pending_ |
| All-pass rate       | _pending_ |
| Turn reduction      | _pending_ |
| Token reduction     | _pending_ |

## Per-task breakdown

| Task                     | A CPR | B CPR | C CPR | A all-pass | B all-pass | C all-pass |
| ------------------------ | ----- | ----- | ----- | ---------- | ---------- | ---------- |
| firm-knowledge/tasks/001 | —     | —     | —     | —          | —          | —          |

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Anthropic ClawQL: `clawql/<claude-id>`
- Nemotron ClawQL: `clawql-cc/<openrouter-id>` (chat completions)
- GHA: `.github/workflows/harvey-lab-firm-knowledge.yml` + `scripts/run-lab-gha.sh`
- OpenRouter: `CLAWQL_LAB_USE_OPENROUTER=1` + `OPENROUTER_API_KEY`
- Startup: `scripts/start-clawql-for-lab.sh` (task-scoped vault)
- Isolation tests: `integrations/harvey-labs/tests/test_vault_isolation.py`
- Ontology LLM extraction off for benches
- Immediate LAB does **not** require our own fine-tune (Arm C uses NVIDIA/Trajectory post-train + ClawQL)

## Notes

Do not outreach to Harvey until this ledger has real Opus A/B numbers (Arm C strongly preferred).
