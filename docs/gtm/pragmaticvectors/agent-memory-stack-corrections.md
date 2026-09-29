# Corrections: The Complete Agent Memory Stack

**Live post:** [pragmaticvectors.com/posts/agent-memory-stack](https://pragmaticvectors.com/posts/agent-memory-stack/)  
**Status:** correction draft for the published essay — apply on the site ASAP; do not wait for `pageindex-ab` results.  
**Evidence:** eval spec [`docs/benchmarks/pageindex-ab-eval-spec-v0.1.md`](../../benchmarks/pageindex-ab-eval-spec-v0.1.md) v0.2 · code `packages/clawql-memory/src/recall/recall-sources.ts`

There is no in-repo full draft of this essay (only outbound links). Use this file as the edit brief for the live page.

## Must-fix claims

### 1. Layers do **not** all run on every `memory_recall` by default

**Post says (approx.):** when `memory_recall` fires, it queries across active layers simultaneously and returns a unified list; ClawQL runs PageIndex and vector together and reranks.

**Ship today:** omit-`sources` resolves to **`vault` + `vector` only**. PageIndex, CodeGraph, and Onyx join that default set only when:

- `CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX=1` / `_CODEGRAPH` / `_ONYX`, or
- master `CLAWQL_MEMORY_RECALL_HYBRID=1`, or
- the caller passes explicit `sources: [...]`.

Hybrid PageIndex has been **opt-in since introduction** ([#653](https://github.com/danielsmithdevelopment/ClawQL/pull/653), [#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806)). There is **no** published measurement that merged PageIndex+vector beats either alone — that is what `pageindex-ab` v0.2 decides.

**Suggested replacement prose:**

> By default, `memory_recall` queries the OKF vault (keyword + wikilinks) and vector KNN. PageIndex, CodeGraph, and Onyx are first-class layers available via `sources` or hybrid env flags. Whether they should join the omit-`sources` default is an empirical default-route decision, not an assumed property of the stack.

### 2. Shipped PageIndex is not LLM category routing

**Post says:** a Frugal-tier LLM classifies ingest into `page_index_path` / `page_index_categories`; recall classifies the query and walks that category tree.

**Ship today:** `clawql-pageindex` builds a **deterministic heading tree** from Markdown (`pageindex_build_tree`), then `pageindex_traverse` / `pageindex_synthesize` / `pageindex_get_content`. Vectorless, no classification LLM, no `page_index_path` frontmatter contract on the hot path.

**Suggested replacement prose:**

> Layer 3 PageIndex in ClawQL is a vectorless heading-tree index over document Markdown: build once, traverse or synthesize under a token budget. It is embedding-free hierarchical retrieval over document structure — not an LLM category router. (Earlier design sketches described LLM category paths; that is not what shipped in 7.x.)

### 3. Lexical path is IDF + log-TF, not "FTS5 BM25"

**Post implies** SQLite FTS5 as the lexical engine alongside vectors.

**Ship today:** vault keyword scoring is in-process **corpus IDF × log-saturated TF** ([#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801)). Okapi BM25 (length normalization) is a **candidate** under evaluation, not current default.

## Optional clarity edits

- Distinguish **catalog opt-in** (`pageindex_*` tools registered only with `CLAWQL_ENABLE_PAGEINDEX=1` as of 8.0.0) from **recall-source opt-in** (`CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX` — not the same switch; still default off).
- CodeGraph: native tree-sitter builder is default (`CLAWQL_CODEGRAPH_BACKEND=native`); Graphify is optional import — not required for the layer to exist ([#793](https://github.com/danielsmithdevelopment/ClawQL/pull/793)).
- Point readers at the default-route eval: [`pageindex-ab-eval-spec-v0.1.md`](../../benchmarks/pageindex-ab-eval-spec-v0.1.md) (v0.2 body).

## Checklist before republish

- [ ] Remove or rewrite "runs both simultaneously" as a present-tense default claim
- [ ] Replace LLM category-routing PageIndex section with heading-tree description
- [ ] Fix FTS5/BM25 wording to IDF+log-TF (mention BM25 as candidate if desired)
- [ ] Add one sentence: hybrid defaults are gated on measured task-completion gains
- [ ] Link OpenBench tooling WINs as "tools work," not "retrieval superiority"
