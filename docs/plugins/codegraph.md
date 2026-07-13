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

Complements ClawQL vault memory (wikilinks + semantic recall) with **precise structural relationships** extracted from TypeScript/JavaScript sources: imports, containment, and inferred calls. Inspired by [Graphify](https://github.com/Graphify-Labs/graphify); implemented natively in TypeScript/Effect for the ClawQL gateway.

## Why add this?

| Layer | ClawQL today | Code graph |
| ----- | ------------ | ---------- |
| Narrative knowledge | Obsidian vault, wikilinks, embeddings | — |
| Document hierarchy | PageIndex (heading trees) | — |
| **Code structure** | Text chunks + manual wikilinks | AST-derived imports/calls/paths |

Use **`memory_recall`** for decisions and cross-session narrative context. Use **`codegraph_*`** before grepping or re-reading dozens of files for architecture tracing.

## MCP tools

| Tool | Purpose |
| ---- | ------- |
| **`codegraph_index`** | Index a repository root (defaults to `CLAWQL_CODEGRAPH_ROOT` or cwd) |
| **`codegraph_query`** | Find symbols by name or concept |
| **`codegraph_neighbors`** | List edges for a node (`imports`, `calls`, `contains`, …) |
| **`codegraph_path`** | Shortest path between two symbols |
| **`codegraph_explain`** | Summarize a symbol and its connections |
| **`codegraph_subgraph`** | BFS subgraph around a seed query |

Edges are labeled **`EXTRACTED`**, **`INFERRED`**, or **`AMBIGUOUS`** (aligned with Graphify confidence semantics).

## Enable

| Env | Default | Effect |
| --- | ------- | ------ |
| **`CLAWQL_ENABLE_CODEGRAPH=1`** | off | Register `codegraph_*` tools via memory tier |
| **`CLAWQL_CODEGRAPH_ROOT`** | cwd | Default repo root for `codegraph_index` |
| **`CLAWQL_CODEGRAPH_PATH`** | `./data` | Base path for `codegraph.db.json` |
| **`CLAWQL_CODEGRAPH_MAX_FILES`** | 5000 | Cap indexed source files |

Requires **`CLAWQL_ENABLE_MEMORY`** (memory plugin registers codegraph tools).

## Typical workflow

1. **`codegraph_index`** once per repo (or after major refactors)
2. **`codegraph_query`** or **`codegraph_path`** instead of repeated file reads
3. **`memory_ingest`** architecture decisions with wikilinks to vault pages; link symbols in prose for hybrid recall

## Roadmap

- Import Graphify `graph.json` exports
- Optional delegate to Graphify MCP (`graphify serve`)
- Tree-sitter grammars beyond TypeScript/JavaScript
- Hybrid recall: merge vault wikilinks with code graph nodes
