# ExtractBench × ClawQL IDP — Action Plan

**August 2026** · Status: overlay scaffolding landed; live scores pending.

Canonical integration: [`integrations/extractbench/`](../../integrations/extractbench/)  
Results ledger: [`extractbench-clawql-results.md`](extractbench-clawql-results.md)  
Essay draft: [`../gtm/pragmaticvectors/extractbench-long-documents.md`](../gtm/pragmaticvectors/extractbench-long-documents.md)

## Goal

Run LlamaIndex [ExtractBench](https://github.com/run-llama/ExtractBench) against ClawQL’s IDP path (pdf-inspector → Docling → schema map) and publish deterministic F1 / cost results — especially on the **long** split where VLM oneshot recall collapses.

## Arms

| Arm | Pipeline                     | Schema map                                  |
| --- | ---------------------------- | ------------------------------------------- |
| A   | `clawql_idp_qwen_extract`    | Self-hosted Qwen3.6 35B over extracted text |
| B   | `clawql_idp_docling_extract` | Structural table/label mapping only         |

## Cost-safe sequence

1. `uv run extract-bench run clawql_idp_qwen_extract --test`
2. `--group short`
3. Full corpus only if short looks competitive
4. Second full run for reproducibility
5. Compare vs `qwen3_6_35b_a3b_fp8_vllm_extract_oneshot_structured_output_file`

Do **not** use Opus for the full 4,869-page run.

## Publishability bar

1. Overall F1 > raw Qwen 87.33
2. Long F1 > 80
3. Cost/page ≤ $1.00
4. Two consistent full runs

## Parallel work

ExtractBench does not block Harvey LAB (and vice versa). After both have publishable ledgers, outreach to LlamaIndex (Jerry Liu) with the long-document structural-extraction story is in scope.
