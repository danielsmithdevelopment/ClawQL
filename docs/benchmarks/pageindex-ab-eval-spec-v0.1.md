---
title: "Memory stack default-route A/B"
status: "spec-pre-freeze"
version: "0.2"
date: "2026-09-29"
author: "@Daniel"
tag: "pageindex-ab-v1"
supersedes: "0.1 (earn-its-place / specialist / demote framing)"
---

# Memory stack default-route A/B (Eval Spec v0.2)

Sep 29, 2026 · @Daniel  
Harness: [`benchmarks/pageindex-ab/`](../../benchmarks/pageindex-ab/)  
Post correction (live overclaims): [`docs/gtm/pragmaticvectors/agent-memory-stack-corrections.md`](../gtm/pragmaticvectors/agent-memory-stack-corrections.md)

## The question and the decision

**Does each addition improve today's default recall on task completion?**

Today's omit-`sources` default is **vault keyword (IDF + log-TF) + vector**. PageIndex, CodeGraph, Onyx hybrids, and BM25 ranking are **not** on that path. This suite decides which additions become default. Task completion is the only gate. Latency and cost are **reported, never decisive** — finishing the work beats saving tokens or milliseconds.

What we have today does not answer it:

- **OpenBench PageIndex cells (August 2026):** tooling WINs (on 1.0 / off 0.0 by construction). Prove tools work, not that they help.
- **ExtractBench:** PageIndex never ran.
- **[#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801):** IDF + log-TF beat raw TF / grep on a 116-note bakeoff — not BM25, not long-document QA.
- **[#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806):** hybrid master switch + RRF — opt-in (`CLAWQL_MEMORY_RECALL_HYBRID=1`).
- **B-7 structured ontology:** `schema`+`filters` → 5/5 where vault keyword scored 0 — different path, still not fused with text layers.
- **Published memory-stack post** still describes simultaneous PageIndex+vector as if default, and PageIndex as LLM category routing — neither matches shipping code (see corrections doc).

### Product action after a clear gain

Any addition whose confirmatory contrast clears zero on strict accuracy (task completion) becomes **default-on** in the matching scope. The full combination of winning additions must also beat today's default before it ships as the new omit-`sources` path. Specialist/demote outcomes from v0.1 are retired: we are not optimizing for catalog thinness.

## Design: factorial inside the hybrid

Base for every confirmatory cell: `memory_recall` with vault + vector always on, shared Docling text, shared section IDs, same model/harness/budget.

**Three factors (2×2×2 = 8 confirmatory arms):**

| Factor        | Off (today)                              | On (candidate)                                                    |
| ------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Ranker**    | IDF + log-TF (`keywordScore` as shipped) | Okapi BM25 (length-normalized; `CLAWQL_MEMORY_VAULT_RANKER=bm25`) |
| **PageIndex** | not in `sources`                         | `sources` includes `pageindex` (+ trees pre-built)                |
| **CodeGraph** | not in `sources`                         | `sources` includes `codegraph` (+ native index pre-built)         |

| Arm id         | Ranker | PageIndex | CodeGraph | Role                          |
| -------------- | ------ | --------- | --------- | ----------------------------- |
| `H-idf`        | IDF    | off       | off       | **Today's default** (control) |
| `H-idf-pi`     | IDF    | on        | off       | +PageIndex                    |
| `H-bm25`       | BM25   | off       | off       | +BM25                         |
| `H-bm25-pi`    | BM25   | on        | off       | +BM25 +PageIndex              |
| `H-idf-cg`     | IDF    | off       | on        | +CodeGraph                    |
| `H-idf-pi-cg`  | IDF    | on        | on        | +PI +CG                       |
| `H-bm25-cg`    | BM25   | off       | on        | +BM25 +CG                     |
| `H-bm25-pi-cg` | BM25   | on        | on        | Full candidate                |

Each addition's effect is estimated **across both settings of the other factors** (main-effect contrast), which in simulation detects about a **6-point** accuracy gain at 80% power at the same question budget that needed ~8 points for a single pairwise A/B.

### Confirmatory contrasts (Holm-corrected α = 0.05)

Fixed before freeze. Unit of analysis = question (mean of 3 trials). Paired bootstrap over questions, 10,000 resamples; McNemar on majority votes as cross-check.

1. **PageIndex effect** — mean(PI on) − mean(PI off) across the other two factors.
2. **BM25 effect** — mean(BM25) − mean(IDF) across the other two factors.
3. **CodeGraph effect** — mean(CG on) − mean(CG off) across the other two factors (primary power on the **code stratum**; also report document-stratum delta for noise).
4. **Combination vs today** — best arm that includes every addition that won (1)–(3), versus `H-idf`. Must clear zero before the new default ships.

**Ship rule:** an addition whose contrast excludes zero becomes default-on in scope (see CodeGraph scope below). Latency, tokens, and dollars are reported beside the decision, never used to veto a clear completion gain.

### Diagnostic arms (exploratory — never decide defaults)

| Arm id         | What the model gets                          | Why                                |
| -------------- | -------------------------------------------- | ---------------------------------- |
| `D-pageindex`  | `pageindex_*` only                           | Where heading trees win/lose alone |
| `D-vector`     | `sources: ["vector"]` + `read_around`        | Semantic-only baseline             |
| `D-idf`        | `sources: ["vault"]` IDF + `read_around`     | Today's keyword alone              |
| `D-bm25`       | `sources: ["vault"]` BM25 + `read_around`    | Strongest cheap keyword alone      |
| `D-grep`       | harness `grep` + `read_range`                | Ceiling for exact-term substring   |
| `D-whole-doc`  | full doc in context (30% headroom only)      | When to skip retrieval             |
| `D-structured` | `memory_recall` with `schema`+`filters` only | Ontology path (list questions)     |
| `D-sql`        | `clawql_sql` / `data_query` only             | DuckDB document-extraction path    |

## Held constant

- **Model:** `openrouter/deepseek/deepseek-chat`, pinned. Frontier subset (64 questions, 1 trial) checks direction.
- **Harness:** OpenCode → `clawql-inference`; system prompt differs only by tool list / ranker flag.
- **Budget per question:** 12 tool calls, 180 s wall clock. Retrieved-token and cost figures are **logged**, not capped for pass/fail.
- **Text:** one Docling conversion per document; one Markdown; one section-ID map for all arms.
- **Setup cost:** tree builds, embeddings, codegraph index, BM25 stats — once per document, reported separately.
- **CodeGraph builder:** native tree-sitter default (`CLAWQL_CODEGRAPH_BACKEND=native`). Graphify import (`codegraph_import_graphify`) is a **secondary** comparison on the code stratum only — not a third default-route factor.
- **Graders** score answer + citations (+ test pass on code tasks). Never which tools were used. Arm conformance voids+reruns on violations.

## Corpus and questions

### Document / repo strata

| Stratum                    | Size                    | Purpose                                                                          |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| **Well-structured docs**   | 8 docs, 20K–150K tokens | PageIndex home turf                                                              |
| **Converted PDFs**         | 8 docs                  | Real IDP path (imperfect headings)                                               |
| **Weakly structured docs** | 8 docs                  | Flat/wrong headings                                                              |
| **Code repos**             | 8 small/medium repos    | CodeGraph home turf — "what breaks if X changes," graded by tests / gold symbols |

Harvey LAB and ExtractBench fixtures stay excluded from the freeze set.

### Question types (documents)

8 per document, balanced: section lookup, buried detail, cross-section, misleading heading, exact term, not-in-document — plus **cross-document list / enumerate** questions (structured path's home turf; required so default-route decisions cannot ignore ontology/SQL).

### Question types (code)

Per repo: impact/blast-radius, symbol locate, "what breaks if this changes," and at least one end-to-end coding task graded by the repo's tests (task completion bar).

### Answer contract

```json
{"answer": "…", "sections": ["<section id>", …], "not_found": false}
```

Code cells may add `"symbols": ["…"]` and `"tests_passed": true|false`. Schema: [`benchmarks/pageindex-ab/schema/answer-contract.schema.json`](../../benchmarks/pageindex-ab/schema/answer-contract.schema.json).

## CodeGraph default scope

| Result                                                                                                                   | Product action                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| CG helps code stratum and does **not** harm document strict accuracy (interval on docs includes zero or is non-negative) | Default-on everywhere when `CLAWQL_ENABLE_CODEGRAPH` can index |
| CG helps code but harms documents                                                                                        | Default-on **only** in workspaces with a repo / codegraph id   |
| CG helps neither                                                                                                         | Stay opt-in                                                    |

Native vs Graphify vs both: exploratory on the code stratum; does not gate the default-on decision.

## Ontology, DuckDB, and structured recall (in scope for gaps)

Facts as of this write:

| Layer                          | Role today                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vault prose**                | Canonical. CQE packs write typed rows into `ontology.db` (SQLite) at ingest ([#877](https://github.com/danielsmithdevelopment/ClawQL/pull/877)).        |
| **Structured `memory_recall`** | `schema`+`filters` → SQL over `ontology.db`, **skips** vault/vector/pageindex/codegraph text merge.                                                     |
| **DuckDB (`clawql-data`)**     | Separate `matters.duckdb`; MCP `data_query` / `clawql_sql`. SQL-only Harvey LAB gold **25/25** (no model). Model-driven contiguous 001–025 still gated. |
| **Vector / PageIndex / Onyx**  | No ontology type link; typed filters do not narrow semantic/tree search.                                                                                |
| **CodeGraph**                  | Own typed graph; same EXTRACTED/INFERRED/AMBIGUOUS tags; `codegraph_impact` → vault `code_change` notes.                                                |
| **`clawql-ontology`**          | CQE packs. Pattern→new-field promotion engine still parked.                                                                                             |

### Gaps that block "best recall" claims

1. **Two SQL stores, two surfaces.** DuckDB can `ATTACH` SQLite, but there is **no** in-repo wiring joining `ontology.db` to `matters.duckdb` under one `clawql_sql`. Verify then unify.
2. **Structured and text never combine.** Typed filter finds the set; nothing automatically retrieves the proving clause. Need a single plan: SQL for the set, text layers for evidence.
3. **Cross-document list questions** must be in this freeze set — leaving them out ignores the layer with the largest measured lift (0→5/5 on B-7).
4. **Run the model-driven Harvey LAB 001–025** pass; SQL gold alone is not agent recall.

Diagnostic arms `D-structured` and `D-sql` measure those paths. A follow-up **v2 fuse cell** (SQL then text) is scheduled after gap (2) ships — not required to freeze v1 confirmatory contrasts (1)–(4).

## Industry benchmarks (separate track)

This A/B ranks **our** setups on long documents + code. It cannot alone claim "best in industry." Conversation-memory vendors cite LoCoMo / LongMemEval / BEAM; published numbers are contested (judge laxity; open-source vs managed gaps). Credible path:

1. Run production recall through LoCoMo, LongMemEval, and **BEAM** (1M / 10M — where gaps remain visible) with a **strict** judge.
2. Publish the harness.
3. Lead with BEAM; treat LoCoMo/LongMemEval as saturated / noisy.

Those results complement this suite; they do not replace the default-route factorial.

## Metrics

| Metric                                 | Role                             |
| -------------------------------------- | -------------------------------- |
| **Strict accuracy / task completion**  | **Primary — only decision gate** |
| Partial credit                         | Reported                         |
| Citation PRF                           | Evidence vs lucky                |
| Abstention (not_found)                 | Hallucination / over-refuse      |
| Tokens, tool calls, latency p50/p95, $ | **Reported only**                |
| Setup cost per document                | Reported only                    |
| Code: tests_passed                     | Task completion on code cells    |

Reported overall, by stratum, and by question type.

## Contamination and gating

- Freeze documents, questions, keys, and these decision rules before arm-prompt tuning. Hash in manifest (`pageindex-ab-v1`).
- `contaminated-smoke` pilot only for harness debug; never cite.
- Equal tuning budget per confirmatory arm.
- Score the frozen set once; then spent (v2 for further tuning).
- Read-only harness for tuners; harness commit pinned.
- Audit implausible scores (>0.98 / <0.02 / >40 pt gaps) before publish.
- Pinned model; mid-run provider update → full rerun.
- Predictions on record before scoring.
- PageIndex / BM25 / CodeGraph get **no more** pilot iterations than each other.

## Preconditions before scored run

| Gap                                                         | Owner              | Status                                                       |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Okapi BM25 vault ranker (`CLAWQL_MEMORY_VAULT_RANKER=bm25`) | `clawql-memory`    | **Landed** (still default `idf` until scored run)            |
| `read_around` MCP for chunk→section                         | `clawql-memory`    | **Landed**                                                   |
| Contaminated-smoke pilot + offline factorial runner         | harness            | **Landed**                                                   |
| Synthetic freeze-candidate (24 docs + 8 repos + keys)       | harness            | **Landed** (`corpus/freeze-candidate/`, not spent)           |
| Native codegraph index fixtures for code stratum            | `clawql-codegraph` | Partial (file-ranker proxy in offline pilot)                 |
| Cross-document list keys + ontology rows                    | annotation         | One list key in candidate; ontology rows pending             |
| Human second-pass + Docling PDF swap → `pageindex-ab-v1`    | annotation         | Not started                                                  |
| Agent-lite factorial (OpenRouter flash-lite, sampled)       | harness            | **Landed** GHA run 36514394251 — ceiling, not discriminative |
| Full OpenCode × clawql-inference matrix                     | harness            | Not yet (cost); agent-lite is the cheap path                 |
| Correct memory-stack post (see below)                       | GTM                | Draft in-repo; live site pending                             |

## Run plan (high level)

1. Corpus + repos + keys (incl. list questions); second annotator; freeze.
2. Finish runner for 8 confirmatory + diagnostics (BM25 + `read_around` already landed).
3. Pilot on `contaminated-smoke`.
4. Record predictions → single scored run.
5. Tier-2 judge (different family from frontier subset) + adjudication + 10% human re-grade.
6. Apply ship rules; update [`openbench-results-ledger.md`](openbench-results-ledger.md); flip defaults for clear winners; schedule fuse + industry benches.

## Published post — required correction (do not wait for results)

Live: [The Complete Agent Memory Stack](https://pragmaticvectors.com/posts/agent-memory-stack/).

| Claim in post                                                                       | Shipping truth                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "`memory_recall` … queries across active layers simultaneously" including PageIndex | Omit-`sources` → **vault + vector only**. PageIndex/CodeGraph/Onyx need hybrid env or explicit `sources`.                                                                                                             |
| "ClawQL runs both [PageIndex and vector] simultaneously and reranks"                | Not the default; hybrid opt-in since [#653](https://github.com/danielsmithdevelopment/ClawQL/pull/653)/[#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806). **Never measured** as beating either alone. |
| PageIndex = "LLM classifies" into `page_index_path` / categories                    | Shipped PageIndex is a **deterministic heading tree** (`pageindex_build_tree` / traverse / synthesize) — vectorless, not LLM category routing.                                                                        |
| Vault FTS5 as the lexical path                                                      | Vault keyword is in-process **IDF + log-TF** (not SQLite FTS5 BM25).                                                                                                                                                  |

Draft correction copy: [`agent-memory-stack-corrections.md`](../gtm/pragmaticvectors/agent-memory-stack-corrections.md).

## Predictions (fill before scored run)

Draft + scaled hard-candidate signals (**not spent freeze** — human second-pass still required). **Keep today's `H-idf` default.**

| Field                | Easy synthetic           | Hard offline (n=161) | Hard agent-lite n=24×1 | Hard agent-lite **n=161×3** (36522240396; confirm 36524273079) |
| -------------------- | ------------------------ | -------------------- | ---------------------- | -------------------------------------------------------------- |
| PageIndex (RRF)      | 0.0 (ceiling)            | −0.006 overall\*     | −0.125 (underpowered)  | **−0.078** (clear; displacement)                               |
| Union vs today       | n/a                      | +0.025               | n/a                    | **+0.019** (`H-idf-pi-union` 0.845)                            |
| Gated vs today       | n/a                      | +0.025               | n/a                    | **+0.006** (`H-idf-pi-gated` 0.832)                            |
| BM25 effect          | 0.0                      | +0.006               | 0.0                    | +0.003 (flat)                                                  |
| CodeGraph effect     | 0.0 (untested‡)          | 0.0                  | 0.0                    | 0.0 (still proxy/ceilinged)                                    |
| Expected new default | n/a                      | keep `H-idf`         | keep `H-idf`           | **keep `H-idf`**                                               |
| Cost                 | ~$0.008                  | $0                   | ~$0.015                | ~$0.49 flash-lite                                              |
| Recorded by / date   | cloud-agent / 2026-09-29 | same                 | same                   | same (+credits-restored confirm)                               |

\*Hard offline by stratum (`H-idf`→`H-idf-pi` RRF): well_structured 0.631→0.692; converted_pdf 0.875→0.594; weak 0.875→1.0.

‡CodeGraph remains a file-ranker proxy on tiny repos — untested as native CG.

**Displacement (offline + agent, agree):** converted_pdf IDF→RRF losses **13/13** displaced (gold in IDF top-k, gone after same-size merge). Agent converted_pdf: IDF/union/gated **1.000**, RRF **0.594**; union recovers **13/13**, gated keeps **13/13**.

**Product rule:** confirmatory RRF same-size top-k hurts (−7.5 pts vs today on full agent). Cheap-context **union** is the only PI merge that beats `H-idf` (+1.9 pts) — **unproven** (3 RFC wins / 0 losses, p≈0.25) and **confounded** by larger context budget. Do not flip omit-`sources`. Neither PageIndex nor BM25 joins the default; leave `pageindex_*` opt-in until a strong-model agent-loop prove/purge (see [`8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md)).

**Pre–next-run hygiene**

- Dropped cite-impossible RFC keys (11 → **150** remaining); rule recorded in [freeze-log-key-hygiene.md](../../benchmarks/pageindex-ab/design/freeze-log-key-hygiene.md) (pre-freeze, not arm-based).
- **Rescore (free):** filter saved cells → `H-idf` 0.840, PI main **−0.087**, union +0.013, gated 0, BM25 0 ([agent-rescore-150.json](../../benchmarks/pageindex-ab/design/agent-rescore-150.json)).
- Offline gold ranks: only **3/15** RFC retrieval misses in ranks 4–10 ([rfc-retrieval-miss-gold-ranks.md](../../benchmarks/pageindex-ab/design/rfc-retrieval-miss-gold-ranks.md)).
- Key sanity script clean on remaining keys (`validate_keys_sanity.py`).
- Confirm run re-called the model (`prior_cells: 0`); trials deterministic.
- Six code misses are grep-solvable; CG must prove unique jobs.
- **8.0.0:** `CLAWQL_ENABLE_PAGEINDEX` default **off**; prove-or-purge by **2026-10-15**.

**Freeze critical path (parallel; k-sweep can lag):**

| Track | Work | Spec |
| ----- | ---- | ---- |
| **A** | Vectify vs query-rewrite (same strong model; answer-only; Net≥5 + no-harm; IETF PDFs; GHA `.run-vectify-fair`) | [vectify-fair-test.md](../../benchmarks/pageindex-ab/design/vectify-fair-test.md) |
| **B** | Strong-model agent loop: ClawQL `pageindex_*` + `codegraph_*` vs grep | [agent-loop-freeze.md](../../benchmarks/pageindex-ab/design/agent-loop-freeze.md) |
| **C** | k-sweep `{3,6,10}` + union matched-k — not freeze-gating | [query-rewrite-arm.md](../../benchmarks/pageindex-ab/design/query-rewrite-arm.md) |

**Beat lock (A):** Net \(W-L \ge 5\) on 12 misses and no-harm ≥14/15; smaller Net = tie = purge. **Combine:** Vectify win + our lose → purge ours, port later; both lose → purge; our agent-loop wins → keep opt-in.

Union rescore edge shrank to **+2 Q** (0.840→0.853) — more likely k-explained.

Harvey LAB / ExtractBench remain excluded from the freeze. Human second-pass still required before spent `pageindex-ab-v1`.

## Status

| Item                  | State                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Decision philosophy   | Frozen in v0.2: task completion only; cost/latency reported           |
| Factorial + contrasts | Frozen in this text                                                   |
| Harness scaffold      | v0.2 + union/gated + displacement + checkpoint/resume GHA             |
| BM25 implementation   | Landed (`CLAWQL_MEMORY_VAULT_RANKER`)                                 |
| Corpus / questions    | Hard-candidate landed; human freeze not spent                         |
| Memory-stack post fix | Correction draft in-repo; live site pending                           |
| Scaled agent-lite     | **Landed** 161×10×3 (36522240396; confirm 36524273079) — keep `H-idf` |
