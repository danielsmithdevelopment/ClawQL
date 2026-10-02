# Content question ↔ gold vocabulary overlap

n=100. Mean overlap with gold section tokens: **0.718**. Exclusive-to-gold: **0.490**.

| stratum | n | mean overlap_gold | mean exclusive_gold |
| ------- | - | ----------------- | ------------------- |
| code | 16 | 0.575 | 0.575 |
| converted_pdf | 42 | 0.757 | 0.214 |
| weakly_structured | 42 | 0.733 | 0.733 |

## Verdict

Content questions share most content words with their gold sections (mean overlap_gold=0.718). Keyword retrieval is near-trivial; more keys from the same builder will saturate the same way.

**Primary path for MaxP / k / rerank:** **EnterpriseRAG-Bench** (document recall) and **LongMemEval-S** (vault). Homegrown paraphrases are a backstop only.

**Gate (backstop):** classify by method-independent overlap — hard if `overlap_gold < 0.3`, no-harm if `≥ 0.6`. Do **not** gate on keyword gold rank (biases the set against keyword). See [`next-hard-content-set.md`](next-hard-content-set.md) and `hard_content_key_gate.py`.

## Next keys

1. Run **EnterpriseRAG-Bench** / **LongMemEval-S** before building more paraphrases.
2. If paraphrasing (backstop): generate from a short summary or topic+answer — **not** the full gold section text — then verify answerability on the full section; accept only if `overlap_gold < 0.3` and pair with a no-harm cohort.
3. Cross-section questions needing two sections.
4. Scrubbed real `memory_recall` queries from the call store.

The gate’s 6 “hard” hits on the soft set are all one template (`wk-*-q06`) — ignore them as a MaxP signal.
