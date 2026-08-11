# Harvey LAB × ClawQL — action plan reconciliation

**Date:** 2026-08-11  
**Source plan:** Cursor handoff “Harvey LAB × ClawQL — Cursor Action Plan” (August 2026)  
**Canonical resume:** [`harvey-lab-pause-handoff.md`](harvey-lab-pause-handoff.md)

This note maps the pasted action plan onto what already ships in ClawQL so agents do **not** rebuild from scratch.

## Already shipped (do not re-implement)

| Plan deliverable             | ClawQL location                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `harness/adapters/clawql.py` | `integrations/harvey-labs/harness/adapters/clawql.py` (+ `clawql_lab_session.py`) |
| ClawQL MCP + vault lifecycle | Shared `ClawQLLabSession`; `scripts/start-clawql-for-lab.sh`                      |
| Wire into harness            | `scripts/apply_clawql_adapter.py` patches a harvey-labs checkout                  |
| Startup script               | `scripts/start-clawql-for-lab.sh`                                                 |
| Baseline / results ledgers   | `docs/benchmarks/harvey-lab-baseline.md`, `harvey-lab-clawql-results.md`          |
| Vault isolation test         | `integrations/harvey-labs/tests/test_vault_isolation.py`                          |
| GHA + OpenRouter             | `.github/workflows/harvey-lab-firm-knowledge.yml`, `scripts/run-lab-gha.sh`       |

Harvey LAB itself stays upstream (`harveyai/harvey-labs`). ClawQL owns an **overlay**, not a fork of the harness into this repo root.

## August 2026 deltas from the original two-arm plan

1. **Three arms** — A Opus baseline, B Opus+ClawQL, C Nemotron 3.5 Lightning+ClawQL.
2. **Arm C adapter** — `clawql-cc/...` via `clawql_chat.py` (OpenRouter Chat Completions). Anthropic Messages cannot host Nemotron.
3. **Skip blocking fine-tune** — use NVIDIA/Trajectory LAB post-train as the specialized base; ClawQL adds retrieval. Training flywheel remains post-ledger.
4. **Published reference** — Arm C story vs **8.3% all-pass** Nemotron LAB result (not vs Opus).
5. **Cost / count** — 250 firm-knowledge tasks (not ~50); Sonnet Phases A–D before Opus Phase E.

## Execution sequence (unchanged cost discipline)

```
★ Arm C first: Nemotron + ClawQL on OpenRouter only (judge: openai/gpt-5.4-mini)
Phase A: Sonnet A/B (needs Anthropic)
Phase B: Sonnet, ~5 tasks — adapter correctness
Phase C: Sonnet, 2 tasks back-to-back — vault isolation
Phase D: Sonnet, prompt tune
Phase E: Opus A/B (+ C) — publishable ledger (Sonnet judge preferred)
Phase F: Sonnet judge — already part of each arm when Anthropic available
```

Trigger via GHA only (`OPENROUTER_API_KEY`). Arm C does **not** need `ANTHROPIC_API_KEY`. Do not wait on Cursor Cloud Agent secrets.

## Success criteria (from plan)

1. Sweeps complete on firm-knowledge with Opus for A/B (C optional but preferred)
2. Results ledger with CPR + all-pass per arm
3. Per-task breakdown of where ClawQL helped / hurt
4. Vault isolation verified
5. RTP/OBT with `community_model` when wired

**Do not outreach Harvey until the Opus ledger exists.**
