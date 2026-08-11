# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-11  
Models: Nemotron 3.5 Lightning ± ClawQL (OpenRouter); Opus A/B pending Anthropic  
Tasks: 250 total; **live sample so far: `firm-knowledge/tasks/001` only**  
Judge: `openai/gpt-5.4-mini` (OpenRouter)

## Status

**Partial live matrix (GHA, OpenRouter-only, no Anthropic).**

| Arm               | CPR             | All-pass | Turns | Docs read | Notes                                                                                                                                                                                               |
| ----------------- | --------------- | -------- | ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nemotron`        | **14.3%** (1/7) | 0%       | 15    | 0         | Run [31530157458](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31530157458) — listed dirs only; C-007 precision pass (vacuous). Later 40-turn retry hit empty OpenRouter `choices` |
| `nemotron-clawql` | **14.3%** (1/7) | 0%       | 27    | 12        | Run [31531113976](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31531113976) — MCP up; used `clawql_memory_recall`×1 + `read`×17; still failed enumeration criteria                 |

Same CPR so far — not a ClawQL win yet. Agent behavior is the bottleneck (dir-walking / incomplete deliverable), not grading plumbing.

Publishable Opus A/B still blocked on Anthropic. Re-judge with Sonnet before any Harvey-facing claim.

## Arm A — Baseline (Opus, standard harness)

| Metric              | Value               |
| ------------------- | ------------------- |
| Criterion pass rate | _pending Anthropic_ |
| All-pass rate       | _pending_           |

## Arm B — Opus + ClawQL

| Metric              | Value               |
| ------------------- | ------------------- |
| Criterion pass rate | _pending Anthropic_ |
| All-pass rate       | _pending_           |

## Arm C pair — Nemotron ± ClawQL (OpenRouter)

| Metric                                    | `nemotron`                                   | `nemotron-clawql` |
| ----------------------------------------- | -------------------------------------------- | ----------------- |
| Criterion pass rate                       | 14.3%                                        | 14.3%             |
| All-pass rate                             | 0%                                           | 0%                |
| vs published Nemotron LAB (8.3% all-pass) | below (single task; empty/incomplete output) | below             |

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml` (PR path trigger)
- Nemotron: `openrouter/<id>` / `clawql-cc/<id>`; API maps to `:free`
- Judge: `OpenRouterChatJudge` + `gpt-5.4-mini`
- GHA builds ClawQL (`npm run build`) so MCP has `dist/server-http.js`
- **Ontology (2026-08-11):** prior `nemotron-clawql` run used keyword-only
  `memory_recall` (no `schema`/`filters`) — same failure mode as B-7 without
  Pattern E. Fix: pre-ingest writes `CLAWQL_*` blocks (Harvey matter ids +
  `HSR_SECOND_REQUEST` title token); system prompt forces
  `schema=legal.Matter` + `filters.title.contains=HSR_SECOND_REQUEST`.

## Notes

Do not outreach to Harvey until Opus A/B ledger exists. These Nemotron numbers are infrastructure smoke, not a publishable LAB claim.
