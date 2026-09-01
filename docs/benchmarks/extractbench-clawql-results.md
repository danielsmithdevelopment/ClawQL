# ExtractBench × ClawQL IDP Results

Date: _pending_  
Pipelines: `clawql_idp_qwen_extract` · `clawql_idp_docling_extract`  
Benchmark: [run-llama/ExtractBench](https://github.com/run-llama/ExtractBench)  
Overlay: [`integrations/extractbench/`](../../integrations/extractbench/)

## Status

**Scaffolding ready; live scores pending.**

Run order (cost discipline):

1. `--test` (6 docs)
2. `--group short`
3. Full run only if short F1 is competitive
4. Second full run for reproducibility

Do **not** use Opus for the full ExtractBench corpus. Prefer self-hosted Qwen3.6 35B for schema mapping (Arm A) or structural Docling-only (Arm B).

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

| Split   |  Value F1 | Precision |    Recall | Page grounding | Word grounding | Cost/page | Latency s/doc |
| ------- | --------: | --------: | --------: | -------------: | -------------: | --------: | ------------: |
| Overall | _pending_ |         — |         — |      _pending_ |      _pending_ | _pending_ |             — |
| Short   | _pending_ | _pending_ | _pending_ |      _pending_ |      _pending_ | _pending_ |     _pending_ |
| Medium  | _pending_ | _pending_ | _pending_ |      _pending_ |      _pending_ | _pending_ |     _pending_ |
| Long    | _pending_ | _pending_ | _pending_ |      _pending_ |      _pending_ | _pending_ |     _pending_ |

## Arm B — ClawQL IDP Docling-only (structural)

| Split   |  Value F1 | Notes             |
| ------- | --------: | ----------------- |
| Overall | _pending_ | No LLM schema map |
| Long    | _pending_ | Ablation vs Arm A |

## Delta vs raw Qwen oneshot

| Metric     | Raw Qwen | ClawQL IDP + Qwen |         Δ |
| ---------- | -------: | ----------------: | --------: |
| Overall F1 |    87.33 |         _pending_ | _pending_ |
| Long F1    |    26.75 |         _pending_ | _pending_ |
| Cost/page  |        — |         _pending_ |         — |

## Publishability checklist

- [ ] Overall F1 > raw Qwen 87.33
- [ ] Long F1 > 80
- [ ] Cost/page ≤ $1.00
- [ ] Two independent full runs agree
- [ ] Leaderboard CSV filled from `integrations/extractbench/leaderboard-entry.template.csv`
- [ ] Essay draft updated with real numbers: [`../gtm/pragmaticvectors/extractbench-long-documents.md`](../gtm/pragmaticvectors/extractbench-long-documents.md)

## Run diary

| Date       | Split        | Pipeline                   | Notes                                                                                        |
| ---------- | ------------ | -------------------------- | -------------------------------------------------------------------------------------------- |
| 2026-09-01 | test (6 doc) | clawql_idp_docling_extract | Ontology sync live (`t1.recallOk`); fixed v8 MCP + docling execute args                      |
| 2026-09-01 | short (252)  | clawql_idp_docling_extract | **In progress** (~1 doc/min) — `CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1`; first 10/10 `raw_output.ontology.t1.recallOk`; log `/tmp/extractbench-short-split.log`, tmux `eb-short-split` |

## Implementation notes

- Provider: `inspect_pdf` → Docling when needed → schema map (LLM or structural)
- Long-list completeness: chunked text mapping with array merge (no page-image VLM oneshot)
- Missing fields must stay `null` (no invention) — T3 dense-doc failure mode
- Env: `CLAWQL_MCP_URL`, `QWEN35_SERVER_URL` (Arm A), `DOCLING_BASE_URL`, `CLAWQL_REPO_ROOT`, `CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1`
- Startup: `integrations/extractbench/scripts/start-clawql-for-extractbench.sh` (ClawQL 8.x tier + docling provider)

## Related

- Harvey LAB (parallel): [`harvey-lab-clawql-results.md`](harvey-lab-clawql-results.md)
- IDP hub: [`../providers/idp-pipeline.md`](../providers/idp-pipeline.md)
