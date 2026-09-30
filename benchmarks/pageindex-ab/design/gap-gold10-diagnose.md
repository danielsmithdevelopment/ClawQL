# Track C — gold@10 ∩ wrong: retrieval→answer gap

**Status:** offline diagnosis done; model failure taxonomy via GHA `.run-gap-diagnose`  
**Why:** Model-scored k=10 has gold_recall ≈ **0.65** but flash answer ≈ **0.29** / Sonnet ≈ **0.37**. Bottleneck moved past retrieval.

## Offline (no spend) — already decisive on “is the answer in context?”

Among **171** keys with keyword gold rank ≤ 10:

| Check | Rate |
| ----- | ---- |
| Answer string in gold section | **95.3%** |
| Answer string in 24k evidence window sent to the model | **93.0%** |
| Gold section fully inside 24k window | 158 / 171 |
| Gold fully truncated out of window | 7 (all well_structured) |
| Gold partially truncated | 6 |

So for ~93% of gold@10 keys the literal answer is in the prompt the model sees. **Evidence truncation is not the main gap** (it explains ≤8%). The remaining miss is reading and/or grading.

The prior grid run only saved **aggregates**, not per-question answers — so grader_reject vs `not_found` vs genuinely_wrong needs one cheap flash re-score on these 171 keys (sentinel below). That is diagnostic spend, not MaxP.

## Failure classes (model pass — fill from `gap-gold10-diagnose.json`)

| Class | Meaning | If dominant → |
| ----- | ------- | ------------- |
| `grader_reject` | Near-correct / contains gold wording; strict string grade fails | Semantic judge; re-score **saved rows** |
| `not_found_despite_gold` | Model abstains though answer is in evidence | Quote-then-answer; second-pass full read of top sections |
| `genuinely_wrong` | Wrong answer | Same answering fixes; check position of gold in list |
| `cite_mismatch` | Answer ok, gold not cited | Grader / multi-valid-section |

## Answering-step fixes (if reading failures dominate)

1. **Best-first order** — already keyword score order; keep (and improve rank via MaxP).
2. **Quote evidence before answering** — finalize prompt change.
3. **Second pass** — re-read top 1–3 sections in full when first pass is `not_found` or low confidence.

k=20 not helping fits mid-context dilution: extra sections push gold toward the middle of a long blob.

## MaxP judgment (changed)

Measure MaxP by:

1. **Model-scored accuracy** (flash, same finalize) at fixed k=10  
2. **Gold rank / position** in the list (mean/median)  

not by recall@10 alone. Higher gold position can improve answers even when recall@10 is unchanged.

## Eval hygiene

- Classify on the gold@10 wrong sample; do not retune MaxP against holdout.  
- Persist per-row grid/diagnose JSONL (`*-rows.jsonl`) so a semantic judge can re-score without re-calling the model.

## Commands

```bash
# Offline
python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py --offline-only

# Model taxonomy (or GHA .run-gap-diagnose)
OPENROUTER_API_KEY=… python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py \
  --model google/gemini-2.5-flash-lite \
  --out benchmarks/pageindex-ab/design/gap-gold10-diagnose.json
```
