# Harvey LAB Baseline — firm-knowledge

Date: 2026-08-08  
Model: **pending** (target publishable: `claude-opus-4-6`; debug: `claude-sonnet-4-6`)  
Tasks: **250** (`tasks/firm-knowledge/tasks/*/task.json`)  
Shared DMS: ~266 matters / ~9,288 files / ~525 MB (`tasks/firm-knowledge/dms`)  
Judge: `claude-sonnet-4-6`  
Notes: standard harness, no ClawQL

## Status

**Blocked on `ANTHROPIC_API_KEY` in this Cloud Agent environment.**

Harness readiness completed without scoring:

| Check | Result |
|---|---|
| Clone `harveyai/harvey-labs` | OK |
| Docs (`tutorial`, `architecture`, `eval-strategies`) | Read |
| `firm-knowledge` inventory | 250 tasks; shared DMS via `docs_dir: ../../dms` |
| First task | `firm-knowledge/tasks/001` — *Antitrust Deals Receiving HSR Second Requests* (11 criteria) |
| `uv sync` | OK |
| Podman | Installed 4.9.3 |
| Sandbox image `lab-sandbox:latest` | Pulled from `ghcr.io/harveyai/lab-sandbox` |
| Agent / judge API key | **Missing** — requested via environment setup |

## Criterion pass rate

_Not yet measured._

## All-pass rate

_Not yet measured._

## Per-task scores

_Empty until Phase A Sonnet single-task and Phase E Opus sweep complete._

## Next

1. Add `ANTHROPIC_API_KEY` to the Cloud Agent environment secrets.
2. Phase A: single Sonnet baseline + eval on `firm-knowledge/tasks/001`.
3. Record CPR / all-pass here for the Opus baseline sweep (same model as ClawQL arm).
