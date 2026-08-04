---
title: Code graph (structural)
description: Graphify-style structural code indexing via codegraph_* MCP tools. Opt-in with CLAWQL_ENABLE_CODEGRAPH=1.
slug: codegraph
status: opt-in
package: clawql-codegraph
order: 3.5
prev: memory
next: documents
---

# Code graph (structural)

**Package:** `packages/clawql-codegraph` (MIT) — registered by **`MemoryPlugin`** when **`CLAWQL_ENABLE_CODEGRAPH=1`**

Complements ClawQL vault memory (wikilinks + semantic recall) with **precise structural relationships** extracted from TypeScript/JavaScript/Python/Go sources. Inspired by [Graphify](https://github.com/safishamsi/graphify); implemented natively in TypeScript/Effect for the ClawQL gateway, with Graphify as the **preferred upstream** via consolidated sync, plus direct import and optional MCP delegate.

## Why add this?

| Layer               | ClawQL today                          | Code graph                      |
| ------------------- | ------------------------------------- | ------------------------------- |
| Narrative knowledge | Obsidian vault, wikilinks, embeddings | —                               |
| Document hierarchy  | PageIndex (heading trees)             | —                               |
| **Code structure**  | Text chunks + manual wikilinks        | AST-derived imports/calls/paths |

Use **`memory_recall`** for decisions and cross-session narrative context. Use **`codegraph_*`** before grepping or re-reading dozens of files for architecture tracing.

## MCP tools

| Tool                            | Purpose                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **`codegraph_sync_graphify`**   | **Preferred:** run Graphify → import → auto-ingest architecture report → optional native blind-spot pass |
| **`codegraph_index`**           | Native-only index (TS/JS/Python/Go) — backup / blind-spot fill                                           |
| **`codegraph_import_graphify`** | Import an existing Graphify `graph.json` (NetworkX node-link) without running Graphify                   |
| **`codegraph_query`**           | Find symbols by name or concept                                                                          |
| **`codegraph_neighbors`**       | List edges for a node (`imports`, `calls`, `contains`, …)                                                |
| **`codegraph_path`**            | Shortest path between two symbols                                                                        |
| **`codegraph_explain`**         | Summarize a symbol and its connections                                                                   |
| **`codegraph_subgraph`**        | BFS subgraph around a seed query                                                                         |

Edges are labeled **`EXTRACTED`**, **`INFERRED`**, or **`AMBIGUOUS`** (aligned with Graphify confidence semantics). Imported nodes may carry a Leiden **`community`** id from Graphify.

## Enable

| Env                                           | Default                                                                   | Effect                                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`CLAWQL_ENABLE_CODEGRAPH=1`**               | off                                                                       | Register `codegraph_*` tools via memory tier                                                                                                                                                                 |
| **`CLAWQL_CODEGRAPH_ROOT`**                   | cwd                                                                       | Default repo root for index / sync                                                                                                                                                                           |
| **`CLAWQL_CODEGRAPH_PATH`**                   | `./data`                                                                  | Base path for `codegraph.db.json`                                                                                                                                                                            |
| **`CLAWQL_CODEGRAPH_BACKEND`**                | `native`                                                                  | Set `graphify` to load Graphify `graph.json` on index                                                                                                                                                        |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_JSON`**          | —                                                                         | Path to Graphify export                                                                                                                                                                                      |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_OUT_DIR`**       | `graphify-out`                                                            | Default artifact directory for sync                                                                                                                                                                          |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_SYNC_CMD`**      | `graphify . --code-only && graphify cluster-only . --no-label`            | Shell command for `codegraph_sync_graphify` (`{repoRoot}`, `{outDir}`). Drop `--code-only` / `--no-label` when you have an LLM key for multimodal + named communities.                                       |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_REFRESH_CMD`**   | —                                                                         | Optional refresh when backend=`graphify`                                                                                                                                                                     |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`**       | —                                                                         | Optional HTTP MCP delegate for live queries                                                                                                                                                                  |
| **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`** | off                                                                       | Merge code graph hits into `memory_recall`                                                                                                                                                                   |

Requires **`CLAWQL_ENABLE_MEMORY`** (memory plugin registers codegraph tools). Install Graphify separately (`pip install graphifyy && graphify install` — CLI remains `graphify`).

## Preferred workflow: `codegraph_sync_graphify`

Keeps the agent tool surface lean: Graphify does multimodal / multi-language extraction offline; ClawQL owns day-to-day query + vault memory.

1. **Run Graphify** (unless `skipGraphifyRun: true`) → `graph.json`, `graph.html`, `GRAPH_REPORT.md`
2. **`codegraph_import_graphify`** into ClawQL storage (community ids preserved on nodes)
3. **Auto-ingest** `GRAPH_REPORT.md` via `memory_ingest` with append + stable title  
   `Codegraph Architecture Report — {repo} ({date})`  
   Wikilinks: `[[Codebase Architecture]]`, `[[{repo}]]`, `[[Codegraph Sync History]]`, plus named Leiden clusters (numbered `Community N` / `cluster_N` labels go into insights only)
4. **Conditional native pass** — `mode: "thorough"` (or `catchBlindSpots: true`) merges `codegraph_index` when Graphify missed native-indexable extensions (`.ts`/`.js`/`.py`/`.go`). Use `forceNative: true` to always merge. `graph.html` stays on disk for human review.

| Mode       | Behavior                                                          |
| ---------- | ----------------------------------------------------------------- |
| `fast`     | Graphify + import + vault ingest                                  |
| `thorough` | Same + native merge when native-fillable blind spots are detected |

## Graphify integration (manual)

1. Run Graphify in your repo: `graphify .` → `graphify-out/graph.json`
2. **Import:** `codegraph_import_graphify` with `jsonPath`
3. **Or backend mode:** `CLAWQL_CODEGRAPH_BACKEND=graphify` + `CLAWQL_CODEGRAPH_GRAPHIFY_JSON=...`
4. **Optional live MCP:** serve Graphify over HTTP and set `CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`

## Hybrid recall

When **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`**, `memory_recall` returns vault Markdown hits **and** a `codeGraphHits` array (matching symbols from the indexed graph). Pass `includeCodeGraph: true` on a single call to force hybrid mode when the env flag is off.

## Typical workflow

1. **`codegraph_sync_graphify`** after major structural changes (or `codegraph_import_graphify` / `codegraph_index` for narrower cases)
2. **`codegraph_path`** / **`codegraph_query`** instead of repeated file reads
3. **`memory_recall`** with hybrid enabled for narrative + structural context (architecture report is already in the vault after sync)
4. Open `graph.html` locally when you need the interactive visualization
