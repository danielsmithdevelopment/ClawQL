# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-12  
Models: Nemotron 3.5 Lightning ± ClawQL; Opus 4.8 ± ClawQL (OpenRouter validation)  
Tasks: 250 total; **Opus/Nemotron smoke: task 001**; **Nemotron sweep: first 25 in flight**  
Judges: Nemotron — `openai/gpt-5.4-mini`; Opus validation — `claude-sonnet-4-6` via OpenRouter

## Status

**Nemotron 25-task sweep in flight:** [31561738454](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31561738454)  
Marker `.run-nemotron-sweep` → tasks `001`–`025`, arms `nemotron` + `nemotron-clawql`, OpenRouter, judge **`openai/gpt-5.4-mini`**, `max-parallel: 4`.

### Validity of this sweep

| Claim                                                          | Valid?                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Internal ClawQL lift (nemotron vs nemotron-clawql, same judge) | **Yes**                                                                                                                      |
| Harvey / leaderboard absolute all-pass                         | **Not yet** — need `claude-sonnet-4-6` judge (Harvey methodology) and preferably direct Anthropic for the publishable ledger |

Absolute all-pass will likely differ under Sonnet vs gpt-5.4-mini. Treat this batch as lift + efficiency measurement.

### Post-sweep analysis checklist

1. **Headline:** all-pass rate and mean CPR per arm
2. **Turns:** median / p90 on ClawQL vs baseline — does the 5-turn ClawQL pattern hold, or is task 001 an outlier?
3. **Baseline failure modes:** turn-ceiling hits (e.g. 40/40) vs graded output that still fails criteria
4. **ClawQL failures:** cluster by task / practice area / criteria count → prompt work before leaderboard re-judge
5. **Rate limits:** scan logs for 429 / quota errors under `max-parallel: 4`; lower parallelism or add delay if needed

Prior single-task results remain below.

### Opus A/B (OpenRouter validation) — [31555668711](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31555668711)

| Arm                          | CPR            | All-pass | Turns | Input tokens | Wall (s) | Notes                                  |
| ---------------------------- | -------------- | -------- | ----- | ------------ | -------- | -------------------------------------- |
| `baseline` (Opus 4.8)        | **100%** (7/7) | **100%** | 35    | 1,869,702    | 437      | Sonnet 4.6 judge; no ClawQL            |
| `clawql` (Opus 4.8 + ClawQL) | **100%** (7/7) | **100%** | 5     | 95,893       | 43       | Ontology Pattern E; preferred evidence |

**Quality:** both arms saturate this task (all-pass).  
**Efficiency:** ClawQL uses ~**20× fewer input tokens**, **7× fewer turns**, ~**10× less wall time** at the same Opus model + same judge.

Shared OpenRouter `max_tokens` cap: `CLAWQL_LAB_OPENROUTER_MAX_TOKENS=32768` (both arms). Prior attempt [31554303385](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31554303385) failed baseline on 128k reservation 402.

### Nemotron ± ClawQL — [31552128819](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31552128819)

| Arm               | CPR            | All-pass | Turns | Notes             |
| ----------------- | -------------- | -------- | ----- | ----------------- |
| `nemotron`        | **0%** (0/7)   | 0%       | 40    | Empty deliverable |
| `nemotron-clawql` | **100%** (7/7) | **100%** | 5     | ALL-PASS          |

ClawQL CPR progression (Nemotron): **14.3% → 57.1% → 85.7% → 100%**.

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

## Arm C pair — Nemotron ± ClawQL (OpenRouter)

| Metric                          | `nemotron` | `nemotron-clawql` |
| ------------------------------- | ---------- | ----------------- |
| Criterion pass rate (stability) | 0%         | **100%**          |
| All-pass rate (stability)       | 0%         | **100%**          |

## Interpretation

On this single firm-knowledge task:

1. **Nemotron:** ClawQL is the difference between empty output and all-pass.
2. **Opus:** baseline already all-passes; ClawQL’s win is **cost/latency**, not criterion lift.
3. Story for Harvey outreach still needs a broader sample (and preferably direct Anthropic) before claiming suite-level numbers vs 8.3% all-pass.

## Implementation notes

- Overlay: `integrations/harvey-labs/`
- Matrix: `.github/workflows/harvey-lab-firm-knowledge.yml`
- OpenRouter Opus validation: `.run-opus-ledger` marker (removed after this run)
- `CLAWQL_LAB_OPENROUTER_MAX_TOKENS=32768` shared on both Claude arms

## Next

1. **Nemotron 25-task sweep in flight** — `.run-nemotron-sweep` (delete after completion)
2. Scale to 50 / 250 if CPR/all-pass hold
3. Broader Opus sample when budget allows; direct Anthropic for publishable ledger
4. No Harvey outreach until multi-task Opus ledger exists

## Notes

OpenRouter Opus A/B on one task is directional validation. Do not outreach to Harvey on single-task all-pass alone. Avoid pushing this PR branch while a multi-task sweep is running (`cancel-in-progress` will kill it).
