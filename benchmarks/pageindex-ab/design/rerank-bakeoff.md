# Track C — cross-encoder rerank bakeoff

**Status:** truncation root cause confirmed; full-text candidates for MaxP; model k-grid in flight (GHA)  
**Depends on:** [`gold-rank-diagnostics.md`](gold-rank-diagnostics.md)  
**Interim default:** keep `TOP_K_DOC=20` until model-scored **norerank** cells confirm ([`k-sweep-hidf.md`](k-sweep-hidf.md))

## Eval hygiene (locked)

| Split / arm | Role |
| ----------- | ---- |
| **tune** | Only place to pick MaxP / blend / heading-path / max-length |
| **holdout** | Already peeked in the first gte/bge bakeoff — **do not retune against it**. Treated as contaminated for ranking hyperparams |
| **Fresh builder keys + human sample** | Final confirm for any rerank winner (same discipline as k-sweep) |
| **Model-scored grid ±rerank** | **Bug reproduction** of the 512-cap failure — not a ship/no-ship verdict for rerank |
| **Model-scored grid norerank k=10 vs k=20** | **The** ship gate for interim `TOP_K_DOC=20` |

## Truncation confirmed

| Evidence | Value |
| -------- | ----- |
| First bakeoff `--max-length` | **512** tokens |
| First export clip | **2000** chars |
| well_structured golds at 2k clip | **55/168** |
| converted_pdf mean | ~379 chars (unscathed; r@10 stayed 1.0) |

Cross-encoders scored opening boilerplate on long RFC sections; keyword saw the whole section. That is fixable, not a domain mismatch.

**MaxP prerequisite:** feed **full section text** into the passage splitter. A 2k-clipped export makes MaxP fail on exactly the golds it should rescue.

```bash
# Full-text candidates (default --max-chars 100000)
node benchmarks/pageindex-ab/scripts/export_rerank_candidates.mjs --pool 100 --max-chars 100000
```

## Fixes to try on **tune only** (after k-grid lands)

```bash
# MaxP + heading path + light keyword blend (example — pick on tune)
python3 benchmarks/pageindex-ab/scripts/run_rerank_bakeoff.py \
  --models gte --device cpu --maxp --heading-path --blend 0.4 \
  --max-length 512 --out benchmarks/pageindex-ab/design/rerank-bakeoff-maxp.json

# Or longer context without MaxP (gte supports 8192)
python3 …/run_rerank_bakeoff.py --models gte --max-length 2048 --heading-path --blend 0.4

# GPU / hosted (preferred long-context check)
python3 …/run_rerank_bakeoff.py --models qwen4b --device cuda   # 32k, whole sections
# or Cohere / Voyage rerank API as a quick check (cost OK)
```

Do **not** use holdout to choose among these. Confirm the chosen combo once on **fresh keys**.

## First bakeoff results (CPU, max_seq_length=512, 2k-clipped export) — baseline no-ship

| Method | tune@10 | hold@10 | tune@20 | hold@20 |
| ------ | ------- | ------- | ------- | ------- |
| keyword (baseline) | **0.635** | **0.679** | **0.782** | 0.764 |
| vector | 0.599 | 0.615 | 0.711 | 0.750 |
| union, no rerank | 0.635 | 0.692 | 0.782 | 0.779 |
| **gte** (149M) | 0.590 | 0.683 | 0.737 | 0.760 |
| **bge** (~568M) | 0.596 | 0.683 | 0.712 | **0.788** |

gte/bge knocked more golds out of top-10 than they rescued (RFC stratum). Under the truncation hypothesis this is expected; MaxP / longer context / Qwen3-4B are the retests.

## Model-scored k-grid (GHA `.run-rerank-grid`)

| Cell | How to read it |
| ---- | -------------- |
| `k10_norerank_*` / `k20_norerank_*` | **Decides** whether to keep `TOP_K_DOC=20` under flash-lite (+ Sonnet subset) |
| `k*_rerank_*` | Repro of 512-cap ranks from first bakeoff — informative, **not** the rerank ship decision |

Remove the sentinel after the run lands.

## Scripts

| Script | Job |
| ------ | --- |
| `export_rerank_candidates.mjs` | kw∪vec pools; use `--max-chars 100000` for MaxP |
| `run_rerank_bakeoff.py` | `--maxp` / `--blend` / `--heading-path` / `--max-length` |
| `run_rerank_model_grid.py` | Model-scored k×±rerank (OpenRouter) |
| `requirements-rerank.txt` | torch + sentence-transformers |
