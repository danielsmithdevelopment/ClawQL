# Track C — cross-encoder rerank bakeoff

**Status:** offline bakeoff done for `gte` + `bge` — **neither beats keyword**; `qwen4b` still needs GPU  
**Depends on:** [`gold-rank-diagnostics.md`](gold-rank-diagnostics.md)  
**Interim default:** keep `TOP_K_DOC=20` ([`k-sweep-hidf.md`](k-sweep-hidf.md))

## Design locks

1. **Pool = top-100 keyword ∪ top-100 vector** — union pool has gold **99.2%** of the time.
2. Pick on **tune recall@10**; confirm holdout (`seed=20261015`, 60/40).
3. Models: `bge` / `gte` / `qwen4b` (see registry in `run_rerank_bakeoff.py`).
4. Model-scored grid (k∈{10,20} × ±rerank) still pending OpenRouter — see `run_rerank_model_grid.py` + GHA `.run-rerank-grid`.

## Offline results (CPU, max_seq_length=512)

| Method | tune@10 | hold@10 | tune@20 | hold@20 |
| ------ | ------- | ------- | ------- | ------- |
| keyword (baseline) | **0.635** | **0.679** | **0.782** | 0.764 |
| vector | 0.599 | 0.615 | 0.711 | 0.750 |
| union, no rerank | 0.635 | 0.692 | 0.782 | 0.779 |
| **gte** (149M) | 0.590 | 0.683 | 0.737 | 0.760 |
| **bge** (~568M) | 0.596 | 0.683 | 0.712 | **0.788** |

- **gte / bge do not ship.** Tune lift vs keyword @10 is **−4.5pp / −3.8pp**.
- On tune they **hurt more than they help**: bge pulls 5 golds into top-10 but knocks **11** out; gte 5 vs **12**.
- Damage is concentrated on **well_structured (RFCs)**: keyword 0.380 → gte 0.304 / bge 0.315. Other strata already @1.0.
- `qwen4b` / `qwen8b` **not run here** (no GPU; 15GB CPU host). Still the open question for a 5090 pass.

## Interpretation

The candidate pool is fine (gold almost always present). These two general-domain cross-encoders, at 512-token pairs on RFC sections, **scramble** an already-decent keyword list more than they rescue deep misses. Next levers (in order):

1. **Qwen3-Reranker-4B on GPU** (stronger, code-aware) — same harness: `--models qwen4b --device cuda`.
2. Longer context / less truncation (ModernBERT supports 8k; we used 512 for CPU speed).
3. Domain-adapted reranker or listwise training on RFC-like text.
4. Until something beats keyword on **tune**, keep retrieval as keyword top-k and ship **k=20**.

## Scripts

```bash
node benchmarks/pageindex-ab/scripts/export_rerank_candidates.mjs --pool 100
pip install -r benchmarks/pageindex-ab/requirements-rerank.txt \
  --extra-index-url https://download.pytorch.org/whl/cpu
python3 benchmarks/pageindex-ab/scripts/run_rerank_bakeoff.py --models gte,bge --device cpu
# GPU:
python3 benchmarks/pageindex-ab/scripts/run_rerank_bakeoff.py --models qwen4b --device cuda

# Model-scored k×±rerank (needs OPENROUTER):
python3 benchmarks/pageindex-ab/scripts/run_rerank_model_grid.py --reranker gte --sonnet-n 60
# or GHA sentinel: benchmarks/pageindex-ab/.run-rerank-grid
```

## Eval hygiene

Tune for selection; holdout one-shot. Do not retune on the full signed set. Confirm any future winner on fresh builder keys + human sample.
