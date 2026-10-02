# Corrections: The Complete Agent Memory Stack

**Live post:** [pragmaticvectors.com/posts/agent-memory-stack](https://pragmaticvectors.com/posts/agent-memory-stack/)  
**Status:** correction draft for republish — **Layer 3 PageIndex and CodeGraph both removed from product in 8.0**; apply ASAP so the live post no longer presents either as an active stack layer.  
**Evidence:** eval / purge [`docs/releases/8.0.0-purge-inventory-spec-v0.1.md`](../../releases/8.0.0-purge-inventory-spec-v0.1.md) · backlog [`docs/backlog/post-8.0-vectify-pageindex.md`](../../backlog/post-8.0-vectify-pageindex.md) · [`docs/backlog/post-8.0-codegraph-revisit.md`](../../backlog/post-8.0-codegraph-revisit.md) · code `packages/clawql-memory/src/recall/recall-sources.ts`

There is no in-repo full draft of this essay (only outbound links). Use this file as the edit brief for the live page.

## Must-fix claims

### 1. Layers do **not** all run on every `memory_recall` by default

**Post says (approx.):** when `memory_recall` fires, it queries across active layers simultaneously and returns a unified list; ClawQL runs PageIndex and vector together and reranks.

**Ship today (8.0):** omit-`sources` resolves to **`vault` + `vector` only**. Onyx joins that default set only when:

- `CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1`, or
- the caller passes explicit `sources: [...]`.

**PageIndex and CodeGraph are both removed in 8.0** (tools, hybrid flags, `pageindex.db.json` sync, and the `clawql-codegraph` package). Do not describe either as a live layer. Hybrid PageIndex was opt-in since introduction ([#653](https://github.com/danielsmithdevelopment/ClawQL/pull/653), [#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806)) and measured harmful as a merge (−7.8 pts; 13/13 displaced). Track A fair test tied Net=4 → no Vectify port; see [post-8.0 Vectify backlog](../../backlog/post-8.0-vectify-pageindex.md). CodeGraph's Track B retest tied Net=0 vs working grep → `tie_purge`; see [post-8.0 CodeGraph backlog](../../backlog/post-8.0-codegraph-revisit.md).

**Suggested replacement prose:**

> By default, `memory_recall` queries the OKF vault (keyword + wikilinks) and vector KNN. Onyx is available via `sources` or a hybrid env flag. ClawQL's heading-tree PageIndex tools and hybrid PageIndex recall, and its structural CodeGraph tools, were removed in 8.0 after graded evals failed the ship bar; a Vectify-style redesign (LLM node summaries + strong tree nav) may return later as a new PageIndex experiment on a fresh hard set, and CodeGraph may be revisited on a large-monorepo cohort or with a local model — neither is a revival of the purged surface.

### 2. Do not present PageIndex as Layer 3 of the live stack

**Post says:** a Frugal-tier LLM classifies ingest into `page_index_path` / `page_index_categories`; recall classifies the query and walks that category tree — **or** describes shipped heading-tree `pageindex_*` tools as Layer 3.

**Ship today:** neither. 7.x shipped a deterministic heading tree (`pageindex_build_tree` / traverse / synthesize); that surface is **gone in 8.0**. Earlier LLM category-routing sketches never shipped.

**Suggested replacement prose:**

> Do not list PageIndex as Layer 3 in the current ClawQL stack. The 7.x heading-tree tools were vectorless hierarchical retrieval over Markdown structure — not an LLM category router — and were purged in 8.0 after fair-test evidence. Any future hierarchical index work is post-8.0 backlog (Vectify-style design), not a present-tense product layer.

### 3. Lexical path is IDF + log-TF, not "FTS5 BM25"

**Post implies** SQLite FTS5 as the lexical engine alongside vectors.

**Ship today:** vault keyword scoring is in-process **corpus IDF × log-saturated TF** ([#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801)). Okapi BM25 (length normalization) was evaluated as a candidate and washed vs IDF — not the default.

## Optional clarity edits

- CodeGraph is removed in 8.0 (not just "native by default") — Track B retest tied Net=0 vs working grep ([#793](https://github.com/danielsmithdevelopment/ClawQL/pull/793) was the native-builder preference that preceded the purge).
- Point readers at purge / backlog: [`8.0.0-purge-inventory-spec-v0.1.md`](../../releases/8.0.0-purge-inventory-spec-v0.1.md), [`post-8.0-vectify-pageindex.md`](../../backlog/post-8.0-vectify-pageindex.md), [`post-8.0-codegraph-revisit.md`](../../backlog/post-8.0-codegraph-revisit.md).

## Checklist before republish

- [ ] Remove or rewrite "runs both simultaneously" as a present-tense default claim
- [ ] **Remove Layer 3 PageIndex** from the live stack diagram / prose (or mark removed in 8.0)
- [ ] **Remove CodeGraph** from the live stack diagram / prose (or mark removed in 8.0)
- [ ] Delete LLM category-routing PageIndex section (or one historical footnote only)
- [ ] Fix FTS5/BM25 wording to IDF+log-TF (BM25 was a wash candidate, not default)
- [ ] Add one sentence: hybrid defaults are gated on measured task-completion gains; PageIndex hybrid and CodeGraph both failed that bar
- [ ] Link OpenBench tooling WINs as "tools work," not "retrieval superiority"
- [ ] Drop `CLAWQL_ENABLE_PAGEINDEX` / hybrid PageIndex / `pageindex_*` as operator guidance
- [ ] Drop `CLAWQL_ENABLE_CODEGRAPH` / hybrid CodeGraph / `codegraph_*` as operator guidance
