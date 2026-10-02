# EnterpriseRAG-Bench — retrieval MaxP / k (slice)

n_docs=20189 · n_scored=144 · generated 2026-09-30T06:10:45Z

## Verdict

**no_hard_lift** — hard Δrecall@10 = `-0.052631578947368474` · no-harm Δ = `-0.05947580645161288` (flake allow `0.030`)

| cohort | n | kw R@10 | MaxP R@10 |
| ------ | - | ------- | --------- |
| hard (semantic+intra) | 26 | 0.5789473684210527 | 0.5263157894736842 |
| no_harm (basic) | 33 | 0.9032258064516129 | 0.84375 |

## k-sweep (all scored)

| k | keyword | MaxP |
| - | ------- | ---- |
| 3 | 0.7651515151515151 | 0.7647058823529411 |
| 6 | 0.803030303030303 | 0.875 |
| 10 | 0.8560606060606061 | 0.8823529411764706 |
| 20 | 0.9090909090909091 | 0.9191176470588235 |

## Decision rule

MaxP / rerank / k wins only if **hard improves AND no-harm holds**. See `retrieval-maxp-k.json`.
