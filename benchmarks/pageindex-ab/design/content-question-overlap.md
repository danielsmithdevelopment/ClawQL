# Content question ↔ gold vocabulary overlap

n=100. Mean overlap with gold section tokens: **0.718**. Exclusive-to-gold: **0.490**.

| stratum | n | mean overlap_gold | mean exclusive_gold |
| ------- | - | ----------------- | ------------------- |
| code | 16 | 0.575 | 0.575 |
| converted_pdf | 42 | 0.757 | 0.214 |
| weakly_structured | 42 | 0.733 | 0.733 |

## Verdict

Content questions share most content words with their gold sections (mean overlap_gold=0.718). Keyword retrieval is near-trivial; more keys from the same builder will saturate the same way. Next keys must paraphrase and pass a kw-rank>10 gate, or move MaxP/k experiments to EnterpriseRAG-Bench / LongMemEval-S.

## Next keys

1. Paraphrase away from section wording; **accept only if keyword gold rank > 10**.
2. Cross-section questions needing two sections.
3. Scrubbed real `memory_recall` queries from the call store.
4. Or switch MaxP/k headroom tests to **EnterpriseRAG-Bench** / **LongMemEval-S**.
