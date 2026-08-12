# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-12  
Models: Nemotron 3.5 Lightning ± ClawQL (OpenRouter); Opus A/B validation via OpenRouter  
Tasks: 250 total; **live sample so far: `firm-knowledge/tasks/001` only**  
Judge (Nemotron): `openai/gpt-5.4-mini` · Judge (Opus validation): `claude-sonnet-4-6` via OpenRouter

## Status

**Nemotron ± ClawQL stabilized on task 001 (OpenRouter).**  
**Opus A/B validation:** re-triggered via OpenRouter (same small task). Prior direct-Anthropic attempt [31553952902](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31553952902) skipped — no `ANTHROPIC_API_KEY`; staying on OpenRouter for these validation runs.

Latest Nemotron stability run: [31552128819](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31552128819)

| Arm               | CPR            | All-pass | Turns | Notes                                                                            |
| ----------------- | -------------- | -------- | ----- | -------------------------------------------------------------------------------- |
| `nemotron`        | **0%** (0/7)   | 0%       | 40    | Empty deliverable (`response.md` missing)                                        |
| `nemotron-clawql` | **100%** (7/7) | **100%** | 5     | ALL-PASS — rubric short names + preferred evidence + explicit “Qualifies” column |

Prior packaging run: [31550749489](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31550749489) — clawql **85.7%** (6/7; C-002 judge quirk).  
Prior deliverable-guard run: [31539169062](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31539169062) — clawql **57.1%**.

**ClawQL lift (stability): 0% → 100% CPR / all-pass on the same Nemotron model.**  
Across the packaging series, clawql CPR moved **14.3% → 57.1% → 85.7% → 100%** while baseline stayed near-empty.

## Arm A — Baseline (Opus, standard harness)

| Metric              | Value                         |
| ------------------- | ----------------------------- |
| Criterion pass rate | _pending OpenRouter Opus run_ |
| All-pass rate       | _pending_                     |

## Arm B — Opus + ClawQL

| Metric              | Value                         |
| ------------------- | ----------------------------- |
| Criterion pass rate | _pending OpenRouter Opus run_ |
| All-pass rate       | _pending_                     |

## Arm C pair — Nemotron ± ClawQL (OpenRouter)

| Metric                                    | `nemotron`          | `nemotron-clawql`                                          |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------- |
| Criterion pass rate (stability)           | 0%                  | **100%**                                                   |
| All-pass rate (stability)                 | 0%                  | **100%**                                                   |
| CPR (packaging run)                       | 14.3%               | 85.7%                                                      |
| vs published Nemotron LAB (8.3% all-pass) | below (single task) | **above on this task** (single-task smoke; not full suite) |

### Stability evidence (run 31552128819)

- Pre-ingest continues to flag 6/266 HSR_SECOND_REQUEST matters
- Deliverable: `output/matters-enumeration.md` titled “Qualifying HSR Second-Request Matters” with Qualifies column
- Evidence: joint-status-report (1038-00001), substantial-compliance-certification (1041-00001), second-request-strategy-memo (1003-00001)
- All seven criteria passed under `gpt-5.4-mini`

## ClawQL bugs fixed this pass

- Ontology `results[].reason` mislabeled `keyword` → `structured_predicate` (+ `RecallHit` union)
- LAB recall enrichment: `sandboxDocumentRoot` + `labGuidance`
- Empty-output finish: deliverable guard nudge
- Rubric client short names + `preferredEvidence` / `evidenceRule`
- Explicit “qualifies” deliverable wording (cleared C-002 judge flake)

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml`
- Nemotron: `openrouter/<id>` / `clawql-cc/<id>`; API maps to `:free`
- Judge (PR smoke): `OpenRouterChatJudge` + `gpt-5.4-mini`
- Harvey harness default judges: `claude-sonnet-4-6` and `gpt-5.5` — use Sonnet (prefer direct Anthropic) for publishable Opus ledger

## Next

1. **Opus vs Opus (OpenRouter validation)** — marker `.run-opus-ledger` → Arm A/B Opus 4.8, Sonnet 4.6 judge via OpenRouter on task 001
2. Larger Nemotron sweeps still on OpenRouter after this validation
3. Direct Anthropic ledger later when `ANTHROPIC_API_KEY` is available (`use_openrouter=0`)
4. No Harvey outreach until a publishable Opus ledger exists

## Notes

Do not outreach to Harvey until Opus A/B ledger exists. OpenRouter Opus A/B on one task is directional validation, not a Harvey-facing claim. Nemotron all-pass on one task is infrastructure proof, not a publishable full-suite LAB claim.
