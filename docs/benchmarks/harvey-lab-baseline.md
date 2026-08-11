# Harvey LAB Baseline — firm-knowledge

Date: 2026-08-11  
Model: **pending** (publishable Arm A: `claude-opus-4-8`; debug: `claude-sonnet-4-6`)  
Tasks: **250** (`tasks/firm-knowledge/tasks/*/task.json`)  
Shared DMS: ~266 matters / ~9,288 files / ~525 MB (`tasks/firm-knowledge/dms`)  
Judge: `claude-sonnet-4-6`  
Notes: standard harness, no ClawQL (Arm A)

## Status

**Ready to score in GitHub Actions** with repo secret `OPENROUTER_API_KEY`.  
Three-arm strategy: [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md).  
Action-plan reconciliation: [`harvey-lab-action-plan.md`](harvey-lab-action-plan.md).

Harness readiness completed without scoring:

| Check | Result |
| ----- | ------ |
| Clone `harveyai/harvey-labs` | OK |
| Docs (`tutorial`, `architecture`, `eval-strategies`) | Read |
| `firm-knowledge` inventory | 250 tasks; shared DMS via `docs_dir: ../../dms` |
| First task | `firm-knowledge/tasks/001` — Antitrust HSR Second Requests |
| `uv sync` / Podman / sandbox | OK (agent smoke) |
| Inference path | **GHA** `harvey-lab-firm-knowledge.yml` + OpenRouter |

## Criterion pass rate

_Not yet measured._

## All-pass rate

_Not yet measured._

## Per-task scores

_Empty until Phase A Sonnet single-task and Phase E Opus sweep complete._

## Next

1. `gh workflow run harvey-lab-firm-knowledge.yml` Phase A (`tasks/001`, Sonnet, `baseline,clawql`).
2. Record CPR / all-pass here for Opus Arm A (same model as Arm B).
