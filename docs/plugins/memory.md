---
title: Memory (vault)
description: Durable Obsidian vault tools memory_ingest and memory_recall. Default on; opt out with CLAWQL_ENABLE_MEMORY=0.
slug: memory
status: default-on
package: clawql-memory
order: 3
prev: panguard-proxy
next: documents
---

# Memory (vault)

**Plugin ID:** `clawql-memory`  
**Package:** `packages/clawql-memory` — `MemoryPlugin`

Persists durable session knowledge to an **Obsidian-compatible vault** and recalls it across chats via graph-aware search.

## MCP tools

| Tool                        | Purpose                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| **`memory_ingest`**         | Write structured insights, wikilinks, and optional verbatim tool output to the vault |
| **`memory_recall`**         | Query the vault (text + optional graph depth) before deep work                       |
| **`pageindex_build_tree`**  | Build a vectorless hierarchical index from Markdown (`clawql-pageindex`)             |
| **`pageindex_traverse`**    | Walk the PageIndex tree under a token budget                                         |
| **`pageindex_synthesize`**  | Merge selected nodes into agent context                                              |
| **`pageindex_get_content`** | Read indexed node content                                                            |
| **`codegraph_index`**       | Build structural code graph from repo root (`clawql-codegraph`, opt-in)              |
| **`codegraph_query`**       | Find symbols by name or concept in the code graph                                    |
| **`codegraph_neighbors`**   | List inbound/outbound edges (imports, calls, contains)                               |
| **`codegraph_path`**        | Shortest path between two symbols (Graphify-style trace)                             |
| **`codegraph_explain`**     | Summarize a symbol and its neighborhood                                              |
| **`codegraph_subgraph`**    | BFS subgraph around a seed query                                                     |

## Enable / disable

| Env                             | Default | Effect                                                |
| ------------------------------- | ------- | ----------------------------------------------------- |
| **`CLAWQL_ENABLE_MEMORY=0`**    | on      | Omit `MemoryPlugin` and hide memory + PageIndex tools |
| **`CLAWQL_ENABLE_PAGEINDEX=0`** | on      | Hide `pageindex_*` only (memory ingest/recall remain) |
| **`CLAWQL_ENABLE_CODEGRAPH=1`** | off     | Register `codegraph_*` tools (structural code graph)  |
| **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`** | off | Merge code graph symbol hits into `memory_recall` (`codeGraphHits`) |

## Prerequisites

- Writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** (Docker images often use `/vault`)
- Tools register even without a vault path, but I/O fails until the path is configured

Optional hybrid vector index: see [memory-db-hybrid-implementation.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/memory-db-hybrid-implementation.md) in the repo.

## Typical workflow

1. **`memory_recall`** at task start with a focused query
2. Do work with **`search`** / **`execute`**
3. **`memory_ingest`** with decisions, debugging conclusions, and wikilinks before ending the session

## Learn more

- [Phase 1 platform guide — PageIndex](../getting-started/phase-1-platform-guide.md#2-pageindex-clawql-pageindex)
- [clawql-memory (Memory 2.0)](/learn/memory)
- [MCP tools § memory](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md)
