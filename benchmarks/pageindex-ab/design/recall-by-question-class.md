# Recall@k by question class (offline)

Generated `2026-09-30T04:35:52Z`. No API spend.

Class counts: `{'code_export': 8, 'content': 100, 'depth_position': 154}`

| class | n | R@3 | R@5 | R@10 | R@20 | R@50 | R@100 |
| ----- | - | --- | --- | --- | --- | --- | --- |
| `all_legacy_pooled` | 262 | 0.485 | 0.534 | 0.653 | 0.775 | 0.882 | 0.973 |
| `content` | 100 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| `depth_position` | 154 | 0.123 | 0.208 | 0.409 | 0.617 | 0.799 | 0.955 |
| `code_export` | 8 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| `content_plus_code_export` | 108 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

## Verdict

- Content R@10 → R@20: **1.0 → 1.0** (lift 0.0)
- Depth R@10 → R@20: **0.4090909090909091 → 0.6168831168831169** (this is the pooled climb)
- Ship TOP_K_DOC for content: **10**

Depth/position templates excluded from MaxP / TOP_K_DOC content decision. Pooled R@10→R@20 climb is depth-only when content is already saturated. Prior model k=10 lock stands for content if content R@20 lift < 5pp. MaxP: content recall@10 + content model accuracy (not position within top-10).

## MaxP metrics

- Primary: **content recall@10** + **content model accuracy**
- Do not optimize position-within-top-10 on this keyset when content golds already sit at rank ≤2
- Exclude `depth_position` from recall scoring; optional separate structural track with section#/% headers
