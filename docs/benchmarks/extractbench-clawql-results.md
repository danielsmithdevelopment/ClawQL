# ExtractBench × ClawQL IDP Results

Date: 2026-09-02 (Arm A Mini partial)  
Pipelines: `clawql_idp_qwen_extract` · `clawql_idp_docling_extract`  
Benchmark: [run-llama/ExtractBench](https://github.com/run-llama/ExtractBench)  
Overlay: [`integrations/extractbench/`](../../integrations/extractbench/)

## Status

**Arm B short split stopped at 93/252 (37%). Arm A Mac Mini MLX `--test` partial (4/6 scoreable).**

Run order (cost discipline):

1. `--test` (6 docs) ✓ — Arm B (Mini re-run 2026-09-02 macro ~0.212; short avg ~0.413)
2. `--group short` — **Arm B stopped** at 93/252 (sufficient ablation signal)
3. **Arm A `--test`** — Mini MLX `Qwen3.6-35B-A3B-4bit` partial (see below)
4. Arm A `--group short` if test F1 beats raw Qwen trajectory
5. Full run only if short F1 is competitive

Do **not** use Opus for the full ExtractBench corpus. Prefer self-hosted Qwen3.6 35B for schema mapping (Arm A) or structural Docling-only (Arm B).

## Lessons learned (Arm B)

| Finding                                         | Implication                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Value F1 **34.4** at 93 docs (macro avg)        | Structural-only is a **floor**, not a product — validates layered design                            |
| Median doc F1 **39.6** vs macro **34.4**        | Hard doc types (13F filings) drag averages; **routing by doc class** matters                        |
| Page/bbox grounding **0%**                      | Evidence spans must come from layout pipeline or LLM map — needed for leaderboard grounding metrics |
| Ontology sync **93/93** `recallOk`              | Layer 2/3 meta-ontology bridge works; keep enabled for Arm A runs                                   |
| Docling outliers (**10h** on one valuation PDF) | Need async convert + per-doc timeouts before batch runs                                             |
| Architecture end-to-end ✓                       | MCP → Docling → schema map → ontology recall — ready for Arm A swap-in                              |

**Verdict:** Good for ClawQL **orchestration + ontology** thesis; bad if misread as extraction quality. Arm A is the decisive test.

## Baselines (upstream leaderboard, August 2026)

| System                        | Overall F1 | Long F1 | Cost/page |
| ----------------------------- | ---------: | ------: | --------: |
| LlamaExtract Agentic Plus     |      95.59 |   94.41 |     8.11¢ |
| Codex (GPT-5.5)               |      93.57 |   78.88 |    27.83¢ |
| Reducto Deep Extract          |      90.44 |   92.01 |    34.44¢ |
| Qwen3.6 35B (raw VLM oneshot) |      87.33 |   26.75 |         — |
| LlamaExtract Cost-Effective   |      86.78 |   69.17 |     1.00¢ |
| Gemini 3.5 Flash              |      79.84 |   27.90 |     1.00¢ |

The internal comparison that proves pipeline value: **ClawQL IDP + Qwen** vs **raw Qwen oneshot** (`qwen3_6_35b_a3b_fp8_vllm_extract_oneshot_structured_output_file`), especially on the long split.

## Arm A — ClawQL IDP + Qwen3.6 35B

**Mac Mini MLX (2026-09-02):** `mlx-community/Qwen3.6-35B-A3B-4bit` via `mlx_lm.server` on `:8000`, thinking off, Mini caps (`CHUNK_CHARS≈50k`, `LAYOUT_JSON_CHARS=4k`, `MAX_TOKENS` up to 16384) + truncated-JSON repair in the overlay.

| Doc                | Split  |                      Value F1 (Arm A) | Value F1 (Arm B same doc) |
| ------------------ | ------ | ------------------------------------: | ------------------------: |
| Goshen             | short  |                             **0.779** |                     0.000 |
| pueblo             | medium |                             **0.605** |                     0.020 |
| sm0801             | long   |                             **0.557** |                     0.017 |
| veralto            | medium |                             **0.406** |                     0.000 |
| **macro (4 docs)** | —      |                             **0.587** |                    ~0.009 |
| bianco             | short  | _skipped_ — schema alone ~137k tokens |        0.598 (structural) |
| W14                | short  |  _skipped_ — schema alone ~45k tokens |        0.640 (structural) |

| Split   |   Value F1 | Precision |    Recall | Page grounding | Word grounding | Cost/page | Latency s/doc |
| ------- | ---------: | --------: | --------: | -------------: | -------------: | --------: | ------------: |
| Overall | **~0.59*** |         — |         — |           0.00 |              — |    $0.000 |     ~15–20min |
| Short   | **0.779†** | _pending_ | _pending_ |           0.00 |              — |    $0.000 |     _pending_ |
| Medium  |  **0.506** | _pending_ | _pending_ |           0.00 |              — |    $0.000 |     _pending_ |
| Long    |  **0.557** | _pending_ | _pending_ |           0.00 |              — |    $0.000 |     _pending_ |

\*4/6 `--test` docs (bianco/W14 blocked by schema size on Mini Metal).  
†Short split here is Goshen only (bianco/W14 unscored on Arm A).

### Mini lessons (Arm A)

| Finding                                   | Implication                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Real Qwen MLX beats Ornith stand-in       | Ornith returned empty/`reasoning`-only; Qwen emits JSON in `content` with `enable_thinking:false`                                         |
| Schema size blocks bianco/W14             | Need schema truncation / field batching before Mini can score tax/well forms                                                              |
| `max_tokens` 2k–8k truncates large arrays | Use ≥16k + truncated-JSON repair for list-heavy docs                                                                                      |
| Arm A ≫ Arm B on the 4 scoreable docs     | 0.587 vs ~0.01 — schema map is doing real work; short-split success bar vs Arm B **34.4** still needs bianco/W14 or a larger short sample |

### Arm A next stage (prerequisites)

Cloud agent VM has **no GPU** — Qwen3.6 35B must be external. **Mac mini (MLX):** serve an OpenAI-compatible `/v1` endpoint locally (e.g. `mlx-lm.server` on port 8000) and point `QWEN35_SERVER_URL` at it:

```bash
# Required
export QWEN35_SERVER_URL=http://127.0.0.1:8000   # MLX OpenAI-compatible /v1 on Mac mini
export CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
export DOCLING_BASE_URL=http://127.0.0.1:5001
export CLAWQL_REPO_ROOT=/path/to/ClawQL
export CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1   # optional telemetry

# Start services (see integrations/extractbench/README.md)
integrations/extractbench/scripts/start-clawql-for-extractbench.sh 8080

cd vendor/ExtractBench
uv run extract-bench run clawql_idp_qwen_extract --test
uv run extract-bench run clawql_idp_qwen_extract --group short --max_concurrent 4

# Compare vs raw Qwen baseline
uv run extract-bench compare \
  clawql_idp_qwen_extract \
  qwen3_6_35b_a3b_fp8_vllm_extract_oneshot_structured_output_file
```

**Success bar for short split:** Value F1 materially above Arm B (**34.4**) and trending toward raw Qwen oneshot (**87.3** overall; long split **26.75** is the key gap to beat).

## Arm B — ClawQL IDP Docling-only (structural) — FINAL PARTIAL

| Split   |  Value F1 | Precision | Recall | Page F1 | Cost/page | Latency (P50) | Notes                                                  |
| ------- | --------: | --------: | -----: | ------: | --------: | ------------: | ------------------------------------------------------ |
| Short   | **34.43** |     39.38 |  33.28 |    0.00 |    $0.000 |         19.4s | **Stopped** at 93/252 (37%); ontology 93/93 `recallOk` |
| Overall |     _n/a_ |         — |      — |       — |         — |             — | Ablation only                                          |
| Long    |     _n/a_ |         — |      — |       — |         — |             — | Not run separately                                     |

Partial short-split details (2026-09-01, `clawql_idp_docling_extract`, structural schema map, **93 docs**):

| Metric                  |                                              Value |
| ----------------------- | -------------------------------------------------: |
| Docs evaluated          |                   93 / 252 (37%) — run **stopped** |
| Value F1 (macro avg)    |                                              34.43 |
| Value precision         |                                              39.38 |
| Value recall            |                                              33.28 |
| Array record F1         |                                              22.45 |
| Accuracy                |                                              22.91 |
| Median per-doc Value F1 |                                               39.6 |
| Ontology `recallOk`     |                                            93 / 93 |
| Latency P50 / P95       |                              19.4s / 89.5s per doc |
| Latency max (outlier)   | 10.1h (`3N1AB7AP8FY283932_professional_valuation`) |

Re-evaluate partial results:

```bash
cd vendor/ExtractBench
uv run extract-bench run clawql_idp_docling_extract --group short --skip_inference --force --open_report=False
```

## Delta vs raw Qwen oneshot

| Metric     | Raw Qwen | ClawQL IDP + Qwen (Mini 4-doc) | Arm B (structural) |                     Δ (target) |
| ---------- | -------: | -----------------------------: | -----------------: | -----------------------------: |
| Overall F1 |    87.33 |                     **~58.7*** |              34.43 |                      _pending_ |
| Long F1    |    26.75 |                      **55.69** |                n/a | **beat 26.75** ✓ (sm0801 only) |
| Cost/page  |        — |                         $0.000 |             $0.000 |                        ≤ $1.00 |

\*Not a full `--test` / leaderboard overall — bianco/W14 unscored on Mini.

## Publishability checklist

- [ ] Overall F1 > raw Qwen 87.33
- [x] Long F1 > 26.75 on Mini sm0801 (**55.69**) — stretch >80 still open
- [x] Cost/page ≤ $1.00 (local MLX)
- [ ] Two independent full runs agree
- [x] Arm B ablation complete (93-doc partial)
- [x] Arm A Mini partial (4/6 `--test` docs) recorded
- [ ] Leaderboard CSV filled from `integrations/extractbench/leaderboard-entry.template.csv`
- [ ] Essay draft updated with real numbers: [`../gtm/pragmaticvectors/extractbench-long-documents.md`](../gtm/pragmaticvectors/extractbench-long-documents.md)

## Run diary

| Date       | Split                | Pipeline                   | Notes                                                                               |
| ---------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| 2026-09-01 | test (6 doc)         | clawql_idp_docling_extract | Ontology sync live (`t1.recallOk`); fixed v8 MCP + docling execute args             |
| 2026-09-01 | short (93/252)       | clawql_idp_docling_extract | **Stopped** — final partial Value F1 **34.43**; ontology 93/93 `recallOk`; PR #1022 |
| 2026-09-01 | short (44/252)       | clawql_idp_docling_extract | Mid-run partial re-eval (Value F1 39.18)                                            |
| 2026-09-02 | test (6 doc)         | clawql_idp_docling_extract | Mini Arm B re-run macro ~0.212; short avg ~0.413                                    |
| 2026-09-02 | test (4/6)           | clawql_idp_qwen_extract    | Mini MLX Qwen3.6-35B-A3B-4bit; macro **0.587**; skip bianco/W14 (schema too large)  |
| _next_     | short / schema-batch | clawql_idp_qwen_extract    | Schema truncation for bianco/W14; then `--group short`                              |

## Implementation notes

- Provider: `inspect_pdf` → Docling when needed → schema map (LLM or structural)
- Long-list completeness: chunked text mapping with array merge (no page-image VLM oneshot)
- Missing fields must stay `null` (no invention) — T3 dense-doc failure mode (13F ~0% F1 on Arm B)
- Env: `CLAWQL_MCP_URL`, `QWEN35_SERVER_URL` (Arm A), `DOCLING_BASE_URL`, `CLAWQL_REPO_ROOT`, `CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1`
- Startup: `integrations/extractbench/scripts/start-clawql-for-extractbench.sh` (ClawQL 8.x tier + docling provider)

## Related

- Harvey LAB (parallel): [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)
- IDP hub: [`../providers/idp-pipeline.md`](../providers/idp-pipeline.md)
- Essay draft: [`../gtm/pragmaticvectors/extractbench-long-documents.md`](../gtm/pragmaticvectors/extractbench-long-documents.md)
