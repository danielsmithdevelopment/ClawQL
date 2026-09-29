# RFC retrieval-miss gold ranks (offline, pre–k-sweep)

**Generated from:** hard-candidate IDF vault ranker, full section lists.  
**Miss set:** 15 `H-idf` agent-lite RFC questions that failed with gold absent from `retrieval_ids` (before key hygiene).  
**Purpose:** predict whether raising top-k alone fixes them before spending another ~$0.50 agent run.

## Prediction

| Gold rank bucket | Count | k-sweep implication                          |
| ---------------- | ----- | -------------------------------------------- |
| 1–3              | 0     | Already in today's budget — not these misses |
| 4–6              | 2     | Fixed by **k=6**                             |
| 7–10             | 1     | Fixed by **k=10**                            |
| 11–50            | 8     | Larger k helps little; query mismatch        |
| >50 or missing   | 4     | Outside useful k; rewrite query / agent loop |

**Bottom line:** k∈{6,10} recovers at most **3/15** of these misses. The other **12** need better queries (agent loop, reformulation), not a bigger fixed budget. Still run the k-sweep — it may help other strata and is the right control for the union confound — but do not expect it to clear the RFC section-lookup / buried-detail pattern.

## Rows

| id            | type           | doc     | gold_rank | gold_id                               |
| ------------- | -------------- | ------- | --------- | ------------------------------------- |
| hc-rfc-04-q03 | buried_detail  | rfc7636 | **6**     | sec-4-6-server-verifies-…             |
| hc-rfc-05-q03 | buried_detail  | rfc7807 | **5**     | sec-4-defining-new-problem-types      |
| hc-rfc-06-q03 | buried_detail  | rfc8615 | **9**     | sec-4-2-interaction-with-web-browsing |
| hc-rfc-08-q03 | buried_detail  | rfc9205 | 11        | sec-4-7-specifying-http-header-fields |
| hc-rfc-05-q02 | section_lookup | rfc7807 | 16        | sec-1-introduction-2                  |
| hc-rfc-06-q02 | section_lookup | rfc8615 | 18        | sec-1-introduction-2                  |
| hc-rfc-01-q02 | section_lookup | rfc8259 | 20        | sec-1-introduction-3                  |
| hc-rfc-01-q03 | buried_detail  | rfc8259 | 22        | sec-5-arrays                          |
| hc-rfc-04-q02 | section_lookup | rfc7636 | 36        | sec-1-introduction-3                  |
| hc-rfc-03-q03 | buried_detail  | rfc7519 | 41        | sec-5-verify-that-the-resulting-…     |
| hc-rfc-08-q02 | section_lookup | rfc9205 | 45        | sec-1-introduction                    |
| hc-rfc-03-q02 | section_lookup | rfc7519 | **57**    | sec-1-introduction-4                  |
| hc-rfc-02-q02 | section_lookup | rfc6749 | **104**   | sec-1-introduction-4                  |
| hc-rfc-07-q03 | buried_detail  | rfc9110 | **278**   | sec-1-if-the-field-value-…            |
| hc-rfc-07-q02 | section_lookup | rfc9110 | **279**   | sec-1-introduction                    |

Machine-readable snapshot (local, gitignored under `results/`): regenerate with:

```bash
node --input-type=module <<'NODE'
// see agent session / design note — rankSectionsVault IDF over hard-candidate keys
NODE
```

## Related key hygiene

Dropped before freeze (cite-impossible / bogus answers): all RFC `MUST/SHALL` quotes with empty `gold_sections`, and all “earliest publication year” fallbacks (e.g. answer `2070`). See builder change in `build_hard_candidate.py` and `candidate-manifest.json` → `predictions.key_hygiene`.
