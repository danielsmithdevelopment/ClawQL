# Track C — gold@10 ∩ wrong: retrieval→answer gap

**Status:** done (flash-lite finalize on 171 gold@10 keys; rows persisted)  
**Why:** Model-scored k=10 has gold_recall ≈ **0.65** but flash answer ≈ **0.29** / Sonnet ≈ **0.37**. Bottleneck moved past retrieval.

## Offline (no spend) — answer already in context

Among **171** keys with keyword gold rank ≤ 10:

| Check | Rate |
| ----- | ---- |
| Answer string in gold section | **95.3%** |
| Answer string in 24k evidence window sent to the model | **93.0%** |
| Gold section fully inside 24k window | 158 / 171 |
| Gold fully truncated out of window | 7 (all well_structured) |
| Gold partially truncated | 6 |

Evidence truncation explains ≤8%. Prior grid artifact was aggregates-only (~4KB) — taxonomy needed this flash re-finalize; rows are now in `gap-gold10-diagnose-rows.jsonl`.

## Model taxonomy (flash-lite, gold@10 only)

Among gold@10, flash answer accuracy = **0.649** (111/171). The 60 wrongs break down:

| Class | n | % of wrongs | Meaning |
| ----- | - | ----------- | ------- |
| `genuinely_wrong` (distractor section) | 52 | **86.7%** | Model answered with a heading/path from another top-10 section |
| `genuinely_wrong` (other) | 6 | 10.0% | Wrong without clean distractor match |
| `grader_reject` | 1 | 1.7% | Near-correct wording; strict string grade fails |
| `not_found_*` | 1 | 1.7% | Abstain (gold truncated out of window) |
| true cite_mismatch (right ans, bad cite) | 0 | 0% | Finalize has no citation field; ans_ok path unused here |

**Verdict: reading failures dominate (~97%). Grader is not the bottleneck.** Sonnet’s 0.37 overall does not imply grader softness on this slice — when gold is in top-10, flash already converts 65%, and almost every miss is a wrong section heading (especially RFC depth/% `section_lookup` on `well_structured`).

### Position effect (drives MaxP metric)

| Gold kw rank | n | Answer accuracy |
| ------------ | - | --------------- |
| 1 | 99 | **0.949** |
| 2 | 14 | 0.500 |
| 3 | 14 | 0.214 |
| 4–10 | 44 | ~0.11 |

Mean gold rank: correct **1.50** vs wrong **4.95**. Raising gold toward position 1 converts answers even at fixed k=10.

Stratum: `converted_pdf` / `weakly_structured` perfect on this slice; `well_structured` only **0.175** (depth/% heading questions).

## Implication → next lever

1. **Do not** prioritize a semantic judge / re-grade first (grader_reject ≈ 0).  
2. **Answering step** is the lever:
   - **MaxP / better ranking** to put gold first (largest measured effect).  
   - Quote evidence before answering.  
   - Second pass: full-read top 1–3 when first pass looks like a distractor heading.  
3. **Judge MaxP** by model-scored accuracy **and** mean/median gold rank — not recall@10 alone.

## Eval hygiene

- Sample and ranks computed on tune+holdout gold@10 for diagnosis only; do not retune MaxP against holdout.  
- Per-row JSONL kept so a judge can still re-score later without re-calling the model.  
- Sentinel `.run-gap-diagnose` removed after landing.

## Commands

```bash
# Offline
python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py --offline-only

# Model taxonomy (or GHA .run-gap-diagnose)
OPENROUTER_API_KEY=… python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py \
  --model google/gemini-2.5-flash-lite \
  --out benchmarks/pageindex-ab/design/gap-gold10-diagnose.json
```
