# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-11  
Models: Nemotron 3.5 Lightning ± ClawQL (OpenRouter); Opus A/B pending Anthropic  
Tasks: 250 total; **live sample so far: `firm-knowledge/tasks/001` only**  
Judge: `openai/gpt-5.4-mini` (OpenRouter)

## Status

**Partial live matrix (GHA, OpenRouter-only, no Anthropic).**

Latest ontology Pattern E run: [31533730043](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31533730043)

| Arm | CPR | All-pass | Turns | Docs read | Notes |
| --- | --- | -------- | ----- | --------- | ----- |
| `nemotron` | **14.3%** (1/7) | 0% | 40 | 1 | Dir-walk / incomplete; only vacuous C-007 |
| `nemotron-clawql` | **14.3%** (1/7) | 0% | 9 | 0 | **Ontology worked:** Pattern E recall + 6/266 `HSR_SECOND_REQUEST` flags; agent listed all 6 matters in chat but **did not write `/workspace/output/`** → judge saw empty deliverable |

Same CPR on the scorecard, but the failure mode changed: retrieval is solved; deliverable write is the blocker.

Publishable Opus A/B still blocked on Anthropic. Re-judge with Sonnet before any Harvey-facing claim.

## Arm A — Baseline (Opus, standard harness)

| Metric | Value |
| ------ | ----- |
| Criterion pass rate | _pending Anthropic_ |
| All-pass rate | _pending_ |

## Arm B — Opus + ClawQL

| Metric | Value |
| ------ | ----- |
| Criterion pass rate | _pending Anthropic_ |
| All-pass rate | _pending_ |

## Arm C pair — Nemotron ± ClawQL (OpenRouter)

| Metric | `nemotron` | `nemotron-clawql` |
| ------ | ---------- | ----------------- |
| Criterion pass rate | 14.3% | 14.3% |
| All-pass rate | 0% | 0% |
| vs published Nemotron LAB (8.3% all-pass) | below (single task; empty/incomplete output) | below (retrieval OK; no output file) |

### Ontology Pattern E evidence (run 31533730043)

- Pre-ingest: `ontology HSR_SECOND_REQUEST flagged 6/266 matters`
- Tool call turn 1: `clawql_memory_recall` with `schema=legal.Matter` + `filters.title.contains=HSR_SECOND_REQUEST`
- Hits: `1003-00001`, `1003-00003`, `1032-00005`, `1038-00001`, `1038-00009`, `1041-00001` (exact task-001 allowlist)
- Agent then verified paths under `/workspace/documents/matters/…` but answered in the assistant message instead of writing a graded file

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml` (PR path trigger)
- Nemotron: `openrouter/<id>` / `clawql-cc/<id>`; API maps to `:free`
- Judge: `OpenRouterChatJudge` + `gpt-5.4-mini`
- GHA builds ClawQL (`npm run build`) so MCP has `dist/server-http.js`
- **Ontology (2026-08-11):** `CLAWQL_*` seed + Pattern E prompt; Harvey matter ids accepted in `clawql-fields`

## Next

1. Prompt/harness: require final answer under `/workspace/output/` before ending
2. Re-run `nemotron-clawql` — expect CPR jump if deliverable is written
3. Opus A/B when Anthropic available; Sonnet re-judge before Harvey outreach

## Notes

Do not outreach to Harvey until Opus A/B ledger exists. These Nemotron numbers are infrastructure smoke, not a publishable LAB claim.
