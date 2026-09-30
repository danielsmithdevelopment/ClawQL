# Track C — gold@10 ∩ wrong: retrieval→answer gap

**Status:** done — and the position-effect claim was revised after a free split on saved rows.  
**Why:** Model-scored k=10 has gold_recall ≈ **0.65** but flash answer ≈ **0.29** / Sonnet ≈ **0.37**.

## Offline — answer already in context

Among **171** gold@10 keys: answer string in the 24k evidence window **93%** of the time. Truncation ≤8%.

## Model taxonomy (flash-lite, gold@10)

| Class | n of 60 wrongs |
| ----- | -------------- |
| genuinely_wrong | 58 (~97%) |
| grader_reject | 1 |
| not_found | 1 |

Grader is not the bottleneck. Most wrongs look like distractor section headings — but see the split below before treating that as a reading/position effect.

## Position curve by question class (decisive)

Saved rows, no new spend. Depth/position templates = builder ladder (`near N% depth`, first/last numbered heading, ~20%/80% cross-section). Those **cannot be answered from section text**: a retrieved section does not say where it sits in the document.

| Gold rank | All gold@10 | Depth/position | Content | Code-export |
| --------- | ----------- | -------------- | ------- | ----------- |
| 1 | 94/99 = **0.95** | **0/5 = 0.00** | 94/94 = **1.00** | — |
| 2 | 7/14 = 0.50 | 1/8 = 0.12 | 6/6 = **1.00** | — |
| 3 | 3/14 = 0.21 | 3/6 = 0.50 | — | **0/8 = 0.00** |
| 4–10 | ~0.11–0.60 | flat ~0.1–0.6 | — | — |

| Bucket | n | Answer accuracy | Mean gold rank (correct / wrong) |
| ------ | - | --------------- | -------------------------------- |
| `depth_position` | 63 | **0.175** | 5.55 / 5.25 (no position signal) |
| `content` | 100 | **1.000** | 1.06 / — |
| `code_export` | 8 | **0.000** | — / 3.0 (all answer `../src/core.js`) |

**Composition artifact:** the overall rank-1 pool is 94/99 content (all correct) + 5 depth (all wrong). The steep 0.95→0.1 curve is **not** a mid-context reading effect — it is depth templates failing at every rank while content clusters at rank 1 and passes.

Depth rank-1 accuracy **0.00** falsifies “model answers the top section when that happens to be gold.” On these keys the model is not reading position at all.

## Revised verdict

1. **Do not tune MaxP for the overall position curve** — that curve is the depth template.
2. **Fix or down-weight depth/position questions** before using them as a reading signal:
   - Prefer: put section number + percent-through-doc in each section header so the question is answerable from retrieved text, **or**
   - Down-weight / exclude the template (real users rarely ask where a heading sits).
3. **Judge MaxP on `content` keys only** (model accuracy + gold rank). Optionally track `code_export` separately (systematic distractor, n=8).
4. **Always report** `position_by_question_class` (depth vs content vs code_export) so a template cannot pass for a reading effect.

Helper: `benchmarks/pageindex-ab/scripts/question_templates.py`. Grid cells attach the split automatically. Builder tags new keys with `depth_position_template: true`.

## MaxP metrics (locked)

- Primary: flash model-scored **content** answer accuracy at k=10 + mean/median content gold rank.  
- Report: full + per-`question_eval_class` position curves every run.  
- Do **not** use recall@10 alone, and do **not** use the pooled rank→accuracy curve as a reading proof.

## Commands

```bash
python3 benchmarks/pageindex-ab/scripts/run_gap_diagnose.py --offline-only
# After model rows exist:
python3 -c "import json,sys; sys.path.insert(0,'benchmarks/pageindex-ab/scripts'); from question_templates import position_curves_by_question_class; rows=[json.loads(l) for l in open('benchmarks/pageindex-ab/design/gap-gold10-diagnose-rows.jsonl') if l.strip()]; print(json.dumps(position_curves_by_question_class(rows), indent=2))"
```
