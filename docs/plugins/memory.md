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

Persists durable session knowledge to an **Obsidian-compatible vault** and recalls it across chats. Agents should start with **`memory_recall`** (optionally with `sources`) and open **`read_around`** only when they need the enclosing Markdown section.

> **8.0:** ClawQL PageIndex (`pageindex_*`, hybrid PageIndex, `pageindex.db.json`) and CodeGraph (`codegraph_*`, Graphify import/sync, `clawql-codegraph`) are both **removed**. See [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md), [post-8.0 Vectify backlog](../backlog/post-8.0-vectify-pageindex.md), and [post-8.0 CodeGraph backlog](../backlog/post-8.0-codegraph-revisit.md).

## Memory 2.0 components

Each piece has one job. The vault is the only canonical store; everything else is a **derived index**, a **code index**, an **external peer**, or the **recall facade**.

| Component                   | Used for                                                                                     | Unique role                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Obsidian / Vault**        | Store knowledge as Markdown + YAML frontmatter under `Memory/`                               | **Canonical core** every derived index and query path references or cites back into |
| **Wikilinks + `memory.db`** | Parse `[[links]]` into SQLite (`wikilink_edge`, `vault_chunk`) on ingest; traverse on recall | **Explicit structured graph** over the vault — link navigation without vectors      |
| **Embeddings**              | Vector representations of vault chunks for similarity in `memory_recall`                     | **Fuzzy semantic retrieval** when no wikilinks or structural paths exist            |
| **Onyx**                    | `knowledge_search_onyx` / `sources: ["onyx"]`; optional `enterpriseCitations` on ingest      | **External search peer** — supplies org knowledge without ClawQL owning the corpus  |

**Write once, refresh indexes:** `memory_ingest` always writes vault Markdown. Optional `rebuild` refreshes derived layers (memory.db/embeddings). Onyx stays a **search** peer (citations into the vault, not “ingest into Onyx”).

**Agent habit:** start with **`memory_recall`** (`sources` when needed) → follow **`followUps`** into specialists only when you need path / filtered enterprise search.

## MCP tools

| Tool                | Purpose                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| **`memory_ingest`** | Write structured insights, wikilinks, and optional verbatim tool output to the vault |
| **`memory_recall`** | Multi-source recall (`sources`) → `hits[]` + `followUps`; vault `results` kept       |
| **`read_around`**   | Expand a path/chunk hit into the enclosing Markdown heading section                  |

## `memory_recall` sources

```json
{
  "query": "AuthService rate limit",
  "sources": ["vault", "vector", "onyx"],
  "limit": 10,
  "maxDepth": 2
}
```

| Source       | What it contributes                                                 |
| ------------ | ------------------------------------------------------------------- |
| **`vault`**  | Lexical + wikilink BFS over Obsidian Markdown (ranker: IDF or BM25) |
| **`vector`** | Embedding KNN seeds (when vector backend + API key configured)      |
| **`onyx`**   | Enterprise citations via injected Onyx search                       |

**Defaults when `sources` is omitted:** `vault` + `vector`, plus the Onyx hybrid from env (`CLAWQL_MEMORY_RECALL_HYBRID_ONYX`).

**Response:**

- **`results`** — vault-side hits (backward compatible)
- **`hits`** — normalized multi-source hits (`source`, `id`, `score`, `snippet`, …)
- **`followUps`** — specialist tool hints (`knowledge_search_onyx`, …)
- **`sourcesUsed` / `sourceNotes`** — what ran and skip reasons
- **`vaultRanker`** — `idf` (default) or `bm25` when vault was queried

## Vault lexical ranker

| Env                                   | Default | Effect                                                                                                                    |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| **`CLAWQL_MEMORY_VAULT_RANKER=idf`**  | **idf** | Corpus IDF × log-TF ([#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801))                                   |
| **`CLAWQL_MEMORY_VAULT_RANKER=bm25`** | —       | Okapi BM25 (length-normalized). Candidate default via [`pageindex-ab`](../benchmarks/pageindex-ab-eval-spec-v0.1.md) v0.2 |

## `memory_ingest` rebuild

```json
{
  "title": "AuthService rate limits",
  "insights": "## Finding\n…",
  "wikilinks": ["API hardening"],
  "enterpriseCitations": [],
  "rebuild": { "embeddings": true }
}
```

| Flag                     | Effect                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| **`rebuild.embeddings`** | Run memory.db / embedding sync (default on when memory.db enabled; `false` skips) |

## Enable / disable

| Env                                      | Default | Effect                                                       |
| ---------------------------------------- | ------- | ------------------------------------------------------------ |
| **`CLAWQL_ENABLE_MEMORY=0`**             | on      | Omit `MemoryPlugin` and hide memory tools                    |
| **`CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1`** | off     | Default `sources` includes onyx (needs Onyx wired + enabled) |
| **`CLAWQL_MEMORY_VAULT_RANKER`**         | `idf`   | Vault lexical ranker: `idf` or `bm25`                        |

## Prerequisites

- Writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** (Docker images often use `/vault`)
- Tools register even without a vault path, but vault I/O fails until the path is configured
- **Onyx in `sources`:** **`CLAWQL_ENABLE_ONYX=1`** + documents/`onyx` in merge; MCP wires search into memory

Optional hybrid vector index: see [memory-db-hybrid-implementation.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/memory-db-hybrid-implementation.md) in the repo.

## Typical workflow

1. **`memory_recall`** with a focused query (add `sources` when you need code/enterprise in one shot)
2. Follow **`followUps`** only when you need path or filtered Onyx
3. Do work with **`search`** / **`execute`**
4. **`memory_ingest`** with decisions + wikilinks

## Learn more

- [Lifelong guided traversal (P2 plan)](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/lifelong-guided-traversal.md) — MAPF-inspired warm-start / receding-horizon / local-guidance recall
- [Post-8.0 CodeGraph revisit](../backlog/post-8.0-codegraph-revisit.md) — why `codegraph_*` was purged and conditions for revival
- [clawql-memory (Memory 2.0)](/learn/memory)
- [MCP tools § memory](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md)
