# EnterpriseRAG-Bench (ClawQL)

First hard document-recall set for **MaxP / k / rerank** decisions.

See [`design/README.md`](design/README.md).

```bash
python3 benchmarks/enterpriserag-bench/scripts/download_slices.py
python3 benchmarks/enterpriserag-bench/scripts/run_retrieval_maxp_k.py
```

Latest offline slice result: [`results/retrieval-maxp-k.md`](results/retrieval-maxp-k.md).

Lexical MaxP no-lift on hard keys is expected. Next informative run: **cross-encoder MaxP** over full-text passages (Qwen3-4B or hosted reranker) — see [`design/README.md`](design/README.md).
