# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-12  
Models: Nemotron 3.5 Lightning ± ClawQL; Opus 4.8 ± ClawQL (OpenRouter validation)  
Tasks: 250 total; **Opus smoke: task 001**; **Nemotron sweep: first 25 (Sonnet 4.6 judge)**  
Judges: Harvey-parity sweep — `claude-sonnet-4-6` via OpenRouter; earlier Nemotron smoke used `gpt-5.4-mini`

## Status

**Nemotron 25-task sweep re-armed for Harvey judge parity** via `.run-nemotron-sweep`:

- Tasks `001`–`025` · arms `nemotron` + `nemotron-clawql`
- Judge: **`claude-sonnet-4-6`** (Harvey harness default)
- Agents: OpenRouter Nemotron; judge via OpenRouter Anthropic path
- Matrix: 50 jobs, `max-parallel: 4`

### Validity

| Claim                                          | Valid?                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Internal ClawQL lift (same judge both arms)    | **Yes**                                                                                                              |
| Harvey methodology judge (`claude-sonnet-4-6`) | **Yes** (this sweep)                                                                                                 |
| Direct Anthropic provenance                    | **Not yet** — OpenRouter routing; fine for submission methodology match on judge model; note routing in any outreach |

### Post-sweep checklist

1. All-pass rate + mean CPR (headline)
2. Median / p90 turns (ClawQL vs baseline)
3. Baseline: turn-ceiling hits vs graded fails
4. ClawQL fail-task clusters
5. Rate-limit / 429 scan under `max-parallel: 4`

Prior single-task results remain below.

### Opus A/B (OpenRouter validation) — [31555668711](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31555668711)

| Arm                          | CPR            | All-pass | Turns | Input tokens | Wall (s) | Notes                                  |
| ---------------------------- | -------------- | -------- | ----- | ------------ | -------- | -------------------------------------- |
| `baseline` (Opus 4.8)        | **100%** (7/7) | **100%** | 35    | 1,869,702    | 437      | Sonnet 4.6 judge; no ClawQL            |
| `clawql` (Opus 4.8 + ClawQL) | **100%** (7/7) | **100%** | 5     | 95,893       | 43       | Ontology Pattern E; preferred evidence |

**Quality:** both arms saturate this task (all-pass).  
**Efficiency:** ClawQL uses ~**20× fewer input tokens**, **7× fewer turns**, ~**10× less wall time**.

### Nemotron ± ClawQL (task 001 smoke) — [31552128819](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31552128819)

| Arm               | CPR            | All-pass | Turns | Notes                                 |
| ----------------- | -------------- | -------- | ----- | ------------------------------------- |
| `nemotron`        | **0%** (0/7)   | 0%       | 40    | Empty deliverable; gpt-5.4-mini judge |
| `nemotron-clawql` | **100%** (7/7) | **100%** | 5     | ALL-PASS                              |

ClawQL CPR progression (Nemotron, early judge): **14.3% → 57.1% → 85.7% → 100%**.

## Arm A — Baseline (Opus)

| Metric               | Value (task 001, OpenRouter) |
| -------------------- | ---------------------------- |
| Criterion pass rate  | **100%** (7/7)               |
| All-pass rate        | **100%**                     |
| Turns / input tokens | 35 / 1.87M                   |

## Arm B — Opus + ClawQL

| Metric               | Value (task 001, OpenRouter) |
| -------------------- | ---------------------------- |
| Criterion pass rate  | **100%** (7/7)               |
| All-pass rate        | **100%**                     |
| Turns / input tokens | 5 / 96k                      |

## Arm C pair — Nemotron ± ClawQL

| Metric                      | `nemotron`  | `nemotron-clawql` |
| --------------------------- | ----------- | ----------------- |
| Task 001 CPR (gpt-5.4-mini) | 0%          | **100%**          |
| 25-task sweep (Sonnet 4.6)  | _in flight_ | _in flight_       |

## Interpretation

1. **Nemotron:** ClawQL was the difference between empty output and all-pass on task 001.
2. **Opus:** baseline already all-passes on task 001; ClawQL wins on cost/latency.
3. **25-task Sonnet-judged sweep** is the first Harvey-judge-parity batch for absolute rates.

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml`
- Sweep marker: `.run-nemotron-sweep` (judge Sonnet 4.6)
- Aggregate: `scripts/aggregate-lab-scorecards.py` (median/p90 turns, ceiling hits)

## Next

1. Complete 25-task Sonnet-judged sweep → publish aggregate CPR / all-pass
2. Scale to 50 / 250 if rates hold; drop `max-parallel` if rate-limited
3. Broader Opus sample; prefer direct Anthropic for final provenance note
4. Harvey outreach only after multi-task Sonnet-judged ledger exists

## Notes

Avoid pushing `integrations/harvey-labs/**` or the LAB workflow while a sweep runs (`cancel-in-progress`). Docs-only pushes are usually OK but prefer not to touch this branch mid-sweep.
