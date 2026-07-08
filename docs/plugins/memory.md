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

| Tool                | Purpose                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| **`memory_ingest`** | Write structured insights, wikilinks, and optional verbatim tool output to the vault |
| **`memory_recall`** | Query the vault (text + optional graph depth) before deep work                       |

## Enable / disable

| Env                          | Default | Effect                                  |
| ---------------------------- | ------- | --------------------------------------- |
| **`CLAWQL_ENABLE_MEMORY=0`** | on      | Omit `MemoryPlugin` and hide both tools |

## Prerequisites

- Writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** (Docker images often use `/vault`)
- Tools register even without a vault path, but I/O fails until the path is configured

Optional hybrid vector index: see [memory-db-hybrid-implementation.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/memory-db-hybrid-implementation.md) in the repo.

## Typical workflow

1. **`memory_recall`** at task start with a focused query
2. Do work with **`search`** / **`execute`**
3. **`memory_ingest`** with decisions, debugging conclusions, and wikilinks before ending the session

## Learn more

- [Vault memory between chats](/learn/vault-memory-between-chats)
- [MCP tools § memory](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md)
