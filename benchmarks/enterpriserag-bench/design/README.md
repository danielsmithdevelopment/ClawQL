# EnterpriseRAG-Bench (ClawQL MaxP / k / rerank path)

**Status:** first hard set for document-recall decisions (replaces saturated pageindex soft content keys).  
**Upstream:** [onyx-dot-app/EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) · arXiv [2605.05253](https://arxiv.org/abs/2605.05253)

## Why this first

PageIndex hard-candidate content keys copy gold wording (mean overlap ≈ 0.72; R@3=1.0). Homegrown paraphrases are a backstop. EnterpriseRAG questions were not built around ClawQL’s retriever; scores are public.

## Cohorts (method-independent)

| Cohort | EnterpriseRAG `question_type` | Role |
| ------ | ----------------------------- | ---- |
| **hard** | `semantic`, `intra_document_reasoning` | Low lexical overlap / long-doc — MaxP’s job |
| **no_harm** | `basic` | Easy keys — treatment must not regress |
| other | project_related, constrained, … | Report; do not alone decide MaxP |

**Win rule:** hard recall@k improves **and** no-harm holds (≤1 flake). Same shape as Vectify / CodeGraph Track B.

## Slice (default download)

Confluence + Google Drive only (wiki/docs-like). Skip Slack/Gmail mega-corpus until the first MaxP signal lands.

```bash
python3 benchmarks/enterpriserag-bench/scripts/download_slices.py
python3 benchmarks/enterpriserag-bench/scripts/run_retrieval_maxp_k.py
```

Artifacts: `results/retrieval-maxp-k.json` + `.md`. Corpus under `data/` is gitignored.

## k / MaxP / rerank

1. Offline keyword vs **lexical** MaxP doc-recall@k on the slice (this harness) — diagnostic only; a no-lift here is expected because MaxP’s job is how a **cross-encoder** scores long sections, not IDF over char windows.
2. **Informative next run:** cross-encoder MaxP over full-text passages (Qwen3-4B or a hosted reranker; reuse pageindex-ab `run_rerank_bakeoff.py --maxp` patterns) on a candidate pool — whenever spend resumes.
3. Answer-model spend only after CE MaxP headroom is clear under the hard+no-harm rule.
4. **LongMemEval-S** separately for vault / conversation memory.

## Related

- [`next-hard-content-set.md`](../../pageindex-ab/design/next-hard-content-set.md)
- [`post-8.0-vectify-pageindex.md`](../../../docs/backlog/post-8.0-vectify-pageindex.md)

## First slice result (2026-09-30)

Confluence + GDrive slices · n_docs=20 189 · n_scored=144 (26 hard / 33 no-harm).

| Signal | Finding |
| ------ | ------- |
| Hard keyword R@10 | **0.58** (headroom — not saturated like pageindex soft keys) |
| Lexical MaxP vs keyword | **no_hard_lift** (hard ΔR@10 ≈ −0.05; also regresses no-harm) |
| k-sweep (all) | R@3≈0.77 → R@10≈0.86 → R@20≈0.91 |

**Takeaway:** hard-set headroom is real; lexical MaxP no-lift is unsurprising. The decision-quality run is **CE MaxP over full-text passages** (Qwen3-4B or hosted reranker), not another lexical pass. Do not raise default k from this slice alone without the hard+no-harm rule.
