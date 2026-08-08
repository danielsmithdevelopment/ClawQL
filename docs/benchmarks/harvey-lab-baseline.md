# Harvey LAB Baseline — firm-knowledge

Date: 2026-08-08  
Model: **pending** (target publishable: `claude-opus-4-6`; debug: `claude-sonnet-4-6`)  
Tasks: **250** (`tasks/firm-knowledge/tasks/*/task.json`)  
Shared DMS: ~266 matters / ~9,288 files / ~525 MB (`tasks/firm-knowledge/dms`)  
Judge: `claude-sonnet-4-6`  
Notes: standard harness, no ClawQL

## Status

**Paused — resume in GitHub Actions** with repo secret `OPENROUTER_API_KEY` (same as OpenBench).  
See [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md).

Harness readiness completed without scoring:

| Check                                                | Result                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Clone `harveyai/harvey-labs`                         | OK                                                                       |
| Docs (`tutorial`, `architecture`, `eval-strategies`) | Read                                                                     |
| `firm-knowledge` inventory                           | 250 tasks; shared DMS via `docs_dir: ../../dms`                          |
| First task                                           | `firm-knowledge/tasks/001` — Antitrust HSR Second Requests (11 criteria) |
| `uv sync` / Podman / sandbox                         | OK (agent smoke)                                                         |
| Inference path                                       | **GHA** workflow `harvey-lab-firm-knowledge.yml` + OpenRouter            |

## Criterion pass rate

_Not yet measured._

## All-pass rate

_Not yet measured._

## Per-task scores

_Empty until Phase A Sonnet single-task and Phase E Opus sweep complete._

## Next (on resume)

1. `gh workflow run harvey-lab-firm-knowledge.yml` Phase A (`tasks/001`, Sonnet, both arms).
2. Record CPR / all-pass here for Opus baseline (same model as ClawQL arm).
