# ExtractBench × ClawQL IDP

Overlay that registers ClawQL's IDP pipeline as an ExtractBench EXTRACT provider.

Upstream: [run-llama/ExtractBench](https://github.com/run-llama/ExtractBench) · Dataset: [llamaindex/ExtractBench](https://huggingface.co/datasets/llamaindex/ExtractBench)

## Why

ExtractBench's headline finding: on documents longer than ~50 pages, commercial VLMs collapse below 35% recall from **silent list truncation**. Precision stays high; content is dropped.

ClawQL IDP routes with **pdf-inspector**, extracts with **Docling** (page/table structural, no VLM attention window), then maps to the JSON Schema with either:

| Arm | Pipeline name                | Schema map                                                      |
| --- | ---------------------------- | --------------------------------------------------------------- |
| A   | `clawql_idp_qwen_extract`    | Self-hosted Qwen3.6 35B (OpenAI-compatible) over extracted text |
| B   | `clawql_idp_docling_extract` | Deterministic table/label mapping (no LLM)                      |

Arm A is the primary leaderboard candidate. Arm B is the cost-floor / ablation.

## Layout

| Path                                                             | Purpose                                   |
| ---------------------------------------------------------------- | ----------------------------------------- |
| `provider/clawql_idp/`                                           | Provider package copied into ExtractBench |
| `scripts/apply_clawql_provider.py`                               | Copy + register pipelines / docs / env    |
| `scripts/start-clawql-for-extractbench.sh`                       | MCP HTTP with IDP flags                   |
| `scripts/run-extractbench.sh`                                    | Apply + `extract-bench run`               |
| `tests/test_schema_map.py`                                       | Offline unit tests                        |
| `leaderboard-entry.template.csv`                                 | Submission row template                   |
| `../../docs/benchmarks/extractbench-clawql-results.md`           | Results ledger                            |
| `../../docs/gtm/pragmaticvectors/extractbench-long-documents.md` | Essay draft                               |

## Setup

```bash
git clone https://github.com/run-llama/ExtractBench
cd ExtractBench
uv sync --extra runners

# Overlay
python /path/to/ClawQL/integrations/extractbench/scripts/apply_clawql_provider.py \
  --extractbench "$PWD"

# Docling Serve (Scanned/Mixed + Arm B)
docker run -d -p 5001:5001 quay.io/docling-project/docling-serve-cpu:v1.14.3

# ClawQL MCP
/path/to/ClawQL/integrations/extractbench/scripts/start-clawql-for-extractbench.sh 8080

# Env (ExtractBench .env)
CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
QWEN35_SERVER_URL=http://127.0.0.1:8000   # Arm A only — your vLLM / OpenAI-compatible host
```

### Arm A env overrides (Mini / CI)

Pipeline defaults hardcode large `chunk_chars` / `max_tokens`. These env vars **win** over config so Mac Mini MLX or GitHub Actions can tune without editing ExtractBench:

| Env | Purpose | Mini-tested starting point |
| --- | ------- | -------------------------- |
| `CLAWQL_EXTRACTBENCH_MODEL` | Served model id (must match `/v1/models`) | path or HF id for Qwen3.6 35B A3B |
| `CLAWQL_EXTRACTBENCH_CHUNK_CHARS` | Schema-map text chunk size | `50000` |
| `CLAWQL_EXTRACTBENCH_MAX_TOKENS` | Completion budget (list-heavy docs need headroom) | `16384` |
| `CLAWQL_EXTRACTBENCH_LAYOUT_JSON_CHARS` | Cap Docling JSON appendix (Metal OOM if uncapped) | `4000` |
| `CLAWQL_EXTRACTBENCH_LLM_URL` | Alternate OpenAI-compatible base (else `QWEN35_SERVER_URL`) | — |

For MLX: `mlx_lm.server --chat-template-args '{"enable_thinking":false}'` so JSON lands in `content`. Truncated completions are best-effort repaired in `schema_map.parse_json_object`.

**Known Mini gap:** bianco / W14 schemas alone are ~45k–137k tokens — need field batching before full `--test`. See [`docs/benchmarks/extractbench-clawql-results.md`](../../docs/benchmarks/extractbench-clawql-results.md).

## Cost-safe run order

```bash
# Build ontology packages when enabling CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1
npm run build -w clawql-pageindex -w clawql-codegraph -w clawql-api -w clawql-memory -w clawql-ontology

# 6 docs
uv run extract-bench run clawql_idp_qwen_extract --test
uv run extract-bench serve clawql_idp_qwen_extract

# Short split (~252 docs) before full
uv run extract-bench run clawql_idp_qwen_extract --group short

# Full only after short looks promising
uv run extract-bench run clawql_idp_qwen_extract

# Compare vs raw Qwen oneshot VLM baseline on the leaderboard
uv run extract-bench compare \
  clawql_idp_qwen_extract \
  qwen3_6_35b_a3b_fp8_vllm_extract_oneshot_structured_output_file
```

**Do not use Opus for the full 4,869-page run.** Self-hosted Qwen for schema mapping; set `CLAWQL_EXTRACTBENCH_COST_PER_PAGE` (or pipeline `cost_per_page_usd`) to attribute measured infra cost when submitting.

### Meta-ontology sync (optional)

When `CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1`, each EXTRACT also runs
[`runExtractBenchOntologyPipeline`](../../docs/specs/ontology/meta-ontology-v0.1.md)
(scaffold → `ontology.db` → structured `memory_recall`). Results land in
`raw_output.ontology` with T1 array completeness metrics — useful for long-document
list truncation experiments without changing ExtractBench scoring.

Requires `CLAWQL_OBSIDIAN_VAULT_PATH` (set by `start-clawql-for-extractbench.sh`) and
built `clawql-ontology` / `clawql-memory` packages.

**ClawQL 8.x:** use `start-clawql-for-extractbench.sh` (sets `CLAWQL_TIER=enterprise`,
`CLAWQL_PROVIDER=default`, `CLAWQL_BUNDLED_PROVIDERS=docling`, `CLAWQL_REPO_ROOT`) —
bare `CLAWQL_ENABLE_*` flags are ignored without instance/tier composition.

## Success criteria (publishable)

1. Overall F1 above raw Qwen3.6 35B oneshot (87.33) — pipeline adds value
2. Long-split F1 above 80 — attention collapse addressed
3. Cost/page ≤ $1.00 (LlamaExtract Cost-Effective bar)
4. Two runs produce consistent scores

## Related ClawQL docs

- [IDP pipeline hub](../../docs/providers/idp-pipeline.md)
- [pdf-inspector](../../docs/providers/pdf-inspector-onboarding.md)
- [Docling](../../docs/providers/docling-onboarding.md)
- [Harvey LAB parallel stream](../harvey-labs/README.md)
- [Meta-ontology v0.1](../../docs/specs/ontology/meta-ontology-v0.1.md) — Layer 2/3 scaffold + `runExtractBenchOntologyPipeline` (T1 completeness via `ontology.db`)
