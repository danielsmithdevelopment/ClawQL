# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-11  
Models: Nemotron 3.5 Lightning ± ClawQL (OpenRouter); Opus A/B pending Anthropic  
Tasks: 250 total; **live sample so far: `firm-knowledge/tasks/001` only**  
Judge: `openai/gpt-5.4-mini` (OpenRouter)

## Status

**Partial live matrix (GHA, OpenRouter-only, no Anthropic).**

Latest deliverable-guard + ontology run: [31539169062](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31539169062)

| Arm | CPR | All-pass | Turns | Docs read | Notes |
| --- | --- | -------- | ----- | --------- | ----- |
| `nemotron` | **14.3%** (1/7) | 0% | 40 | 0 | Empty deliverable; vacuous C-007 |
| `nemotron-clawql` | **57.1%** (4/7) | 0% | 16 | 7 | Ontology + `/workspace/output/matters-enumeration.md`; deliverable guard fired; missed C-002/C-005/C-006 (wrong Cascade label / wrong evidence docs) |

**ClawQL lift on this task: 14.3% → 57.1% CPR** (same Nemotron model).

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
| Criterion pass rate | 14.3% | **57.1%** |
| All-pass rate | 0% | 0% |
| vs published Nemotron LAB (8.3% all-pass) | below (single task) | below (single task; CPR strong) |

### Ontology + deliverable evidence (run 31539169062)

- Pre-ingest: `ontology HSR_SECOND_REQUEST flagged 6/266 matters`
- Pattern E recall with `schema=legal.Matter` + `title.contains=HSR_SECOND_REQUEST`
- Deliverable guard nudged; agent wrote `output/matters-enumeration.md`
- Passed: C-001, C-003, C-004, C-007
- Failed: C-002 (Cascade client naming), C-005/C-006 (cited strategy memos instead of rubric-named evidence files)

## ClawQL bugs fixed this pass

- Ontology `results[].reason` mislabeled `keyword` → `structured_predicate` (+ `RecallHit` union)
- LAB recall enrichment: `sandboxDocumentRoot` + `labGuidance` (vault `Memory/` not harness-readable)
- Empty-output finish: one forced nudge when ClawQL arm has `CLAWQL_LAB_OUTPUT_DIR` set

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml`
- Nemotron: `openrouter/<id>` / `clawql-cc/<id>`; API maps to `:free`
- Judge: `OpenRouterChatJudge` + `gpt-5.4-mini`

## Next

1. Prompt/evidence: prefer rubric-named second-request docs in deliverable (joint-status-report, substantial-compliance, etc.)
2. Opus A/B when Anthropic available; Sonnet re-judge before Harvey outreach

## Notes

Do not outreach to Harvey until Opus A/B ledger exists. These Nemotron numbers are infrastructure smoke, not a publishable LAB claim.
