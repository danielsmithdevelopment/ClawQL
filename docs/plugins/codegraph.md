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

Complements ClawQL vault memory (wikilinks + semantic recall) with **precise structural relationships** extracted from TypeScript/JavaScript/Python/Go sources. Inspired by [Graphify](https://github.com/Graphify-Labs/graphify); implemented natively in TypeScript/Effect for the ClawQL gateway, with Graphify import and optional MCP delegate.

## Why add this?

| Layer               | ClawQL today                          | Code graph                      |
| ------------------- | ------------------------------------- | ------------------------------- |
| Narrative knowledge | Obsidian vault, wikilinks, embeddings | —                               |
| Document hierarchy  | PageIndex (heading trees)             | —                               |
| **Code structure**  | Text chunks + manual wikilinks        | AST-derived imports/calls/paths |

Use **`memory_recall`** for decisions and cross-session narrative context. Use **`codegraph_*`** before grepping or re-reading dozens of files for architecture tracing.

## MCP tools

| Tool                             | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| **`codegraph_index`**            | Index a repository root (tree-sitter WASM for Python/Go; TS compiler API for TS/JS) |
| **`codegraph_import_graphify`**  | Import Graphify `graph.json` (NetworkX node-link) into ClawQL storage |
| **`codegraph_query`**            | Find symbols by name or concept                                      |
| **`codegraph_neighbors`**        | List edges for a node (`imports`, `calls`, `contains`, …)            |
| **`codegraph_path`**             | Shortest path between two symbols                                    |
| **`codegraph_explain`**          | Summarize a symbol and its connections                               |
| **`codegraph_subgraph`**         | BFS subgraph around a seed query                                     |

Edges are labeled **`EXTRACTED`**, **`INFERRED`**, or **`AMBIGUOUS`** (aligned with Graphify confidence semantics).

## Enable

| Env                                       | Default  | Effect                                       |
| ----------------------------------------- | -------- | -------------------------------------------- |
| **`CLAWQL_ENABLE_CODEGRAPH=1`**           | off      | Register `codegraph_*` tools via memory tier |
| **`CLAWQL_CODEGRAPH_ROOT`**               | cwd      | Default repo root for `codegraph_index`      |
| **`CLAWQL_CODEGRAPH_PATH`**               | `./data` | Base path for `codegraph.db.json`            |
| **`CLAWQL_CODEGRAPH_BACKEND`**            | `native` | Set `graphify` to load Graphify `graph.json` |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_JSON`**      | —        | Path to Graphify export                      |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`**   | —        | Optional HTTP MCP delegate for live queries  |
| **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`** | off  | Merge code graph hits into `memory_recall`   |

Requires **`CLAWQL_ENABLE_MEMORY`** (memory plugin registers codegraph tools).

## Graphify integration

1. Run Graphify in your repo: `/graphify .` → `graphify-out/graph.json`
2. **Import:** `codegraph_import_graphify` with `jsonPath`
3. **Or backend mode:** `CLAWQL_CODEGRAPH_BACKEND=graphify` + `CLAWQL_CODEGRAPH_GRAPHIFY_JSON=...`
4. **Optional live MCP:** serve Graphify over HTTP and set `CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`

## Hybrid recall

When **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`**, `memory_recall` returns vault Markdown hits **and** a `codeGraphHits` array (matching symbols from the indexed graph). Pass `includeCodeGraph: true` on a single call to force hybrid mode when the env flag is off.

## Typical workflow

1. **`codegraph_index`** or **`codegraph_import_graphify`** once per repo
2. **`codegraph_path`** / **`codegraph_query`** instead of repeated file reads
3. **`memory_recall`** with hybrid enabled for narrative + structural context
4. **`memory_ingest`** architecture decisions with wikilinks
