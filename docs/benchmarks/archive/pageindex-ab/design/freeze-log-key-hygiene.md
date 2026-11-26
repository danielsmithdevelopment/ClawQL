# Freeze log — key hygiene (pre-freeze, rule-based)

**Date:** 2026-09-29  
**Corpus:** `pageindex-ab-v1-hard-candidate`  
**Rule (not based on arm results):**

Drop RFC keys that are cite-impossible or builder-bogus:

1. Normative MUST/SHALL quote questions with empty `gold_sections`.
2. “Earliest publication year” fallbacks when Obsoletes is absent (empty gold; often wrong body years such as `2070`).

|         | n   |
| ------- | --- |
| Before  | 161 |
| Dropped | 11  |
| After   | 150 |

**Rescore:** filtered saved cells from run [36524273079](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36524273079) → `design/agent-rescore-150.json` (no new LLM calls).

**Sanity:** `scripts/validate_keys_sanity.py` — answer-in-document + plausible years; clean on remaining keys.
