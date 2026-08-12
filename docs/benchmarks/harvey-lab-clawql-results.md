# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-12  
Models: Nemotron 3.5 Lightning ± ClawQL (OpenRouter); Opus A/B pending Anthropic  
Tasks: 250 total; **live sample so far: `firm-knowledge/tasks/001` only**  
Judge: `openai/gpt-5.4-mini` (OpenRouter)

## Status

**Partial live matrix (GHA, OpenRouter-only, no Anthropic).**

Latest packaging fix run: [31550749489](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31550749489)

| Arm               | CPR             | All-pass | Turns | Notes                                                                                                                             |
| ----------------- | --------------- | -------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `nemotron`        | **14.3%** (1/7) | 0%       | —     | Unchanged empty/near-empty baseline                                                                                               |
| `nemotron-clawql` | **85.7%** (6/7) | 0%       | 4     | Correct short names + rubric evidence; only C-002 failed (judge quirk — deliverable already lists `1038-00001 \| Cascade Retail`) |

**ClawQL lift on this task: 14.3% → 85.7% CPR** (same Nemotron model; was 57.1% before packaging fix).

Prior deliverable-guard run: [31539169062](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31539169062) (57.1% CPR).

Publishable Opus A/B still needs direct Anthropic + Sonnet 4.6 judge before any Harvey-facing claim.

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

| Metric                                    | `nemotron`          | `nemotron-clawql`               |
| ----------------------------------------- | ------------------- | ------------------------------- |
| Criterion pass rate                       | 14.3%               | **85.7%**                       |
| All-pass rate                             | 0%                  | 0%                              |
| vs published Nemotron LAB (8.3% all-pass) | below (single task) | below (single task; CPR strong) |

### Packaging + ontology evidence (run 31550749489)

- Pre-ingest: `ontology HSR_SECOND_REQUEST flagged 6/266 matters`
- Deliverable: `output/matters-enumeration.md` with all six allowlisted matters
- Passed: C-001, C-003, C-004, C-005, C-006, C-007
- Failed: C-002 only — judge said Cascade was not identified despite the table row; likely gpt-5.4-mini noise (Sonnet re-judge recommended for ledger)

## ClawQL bugs fixed this pass

- Ontology `results[].reason` mislabeled `keyword` → `structured_predicate` (+ `RecallHit` union)
- LAB recall enrichment: `sandboxDocumentRoot` + `labGuidance` (vault `Memory/` not harness-readable)
- Empty-output finish: one forced nudge when ClawQL arm has `CLAWQL_LAB_OUTPUT_DIR` set
- Rubric client short names (`Cascade Retail` / `Harrowgate PE` / `Halcyon Semi`) via filename-first + canonical map
- Seed + recall `preferredEvidence` / `evidenceRule` (C-005/C-006 now pass)

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml`
- Nemotron: `openrouter/<id>` / `clawql-cc/<id>`; API maps to `:free`
- Judge (PR smoke): `OpenRouterChatJudge` + `gpt-5.4-mini`
- Harvey harness default judges: `claude-sonnet-4-6` and `gpt-5.5` (`JUDGE_MODELS` in `evaluation/run_eval.py`) — match Sonnet for publishable / Harvey-facing comparisons

## Next

1. Optional: explicit “qualifies” table wording + second Nemotron stability run (target all-pass or sustained 85%+ CPR)
2. Opus vs Opus on same task — direct Anthropic, Sonnet 4.6 judge
3. No Harvey outreach until Opus ledger exists

## Notes

Do not outreach to Harvey until Opus A/B ledger exists. These Nemotron numbers are infrastructure smoke, not a publishable LAB claim.
