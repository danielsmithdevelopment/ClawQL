# Session cache (`cache` MCP tool)

The **`cache`** tool provides **ephemeral, in-process key/value storage** in the ClawQL MCP server. It is **orthogonal** to the Obsidian vault and **`memory_ingest`** / **`memory_recall`**: use **`cache`** for temporary session state; use **vault memory** for durable notes and graph recall.

**Tracking:** [#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75) · Implementation: [`src/clawql-cache.ts`](../src/clawql-cache.ts) · Full MCP reference: **[mcp-tools.md](mcp-tools.md)**.

---

## `cache` vs vault memory

|                         | **`cache`**                                         | **`memory_ingest`** / **`memory_recall`**                 |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Durability**          | None — RAM only in this Node process                | Markdown files + optional **`memory.db`** under the vault |
| **Scope**               | Single process; empty after restart                 | Shared vault path; survives restarts                      |
| **Multi-replica / K8s** | Each pod has its **own** empty cache                | Same vault mount → shared durable state (if configured)   |
| **Eviction**            | **LRU** when **`CLAWQL_CACHE_MAX_ENTRIES`** reached | No automatic eviction of notes                            |
| **Use for**             | Scratch keys, dedup IDs, short-lived flags          | Runbooks, decisions, wikilink graph, RAG                  |

Do **not** use **`cache`** as a substitute for **`memory_ingest`** when the user asked to persist something to the vault.

---

## Enabling the tool

Set **`CLAWQL_ENABLE_CACHE=1`** (or `true` / `yes`). Parsed with other flags in [`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts) ([#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)).

---

## LRU behavior

Storage is a **`Map`** whose **iteration order** follows insertion/recency:

- **Least recently used (LRU)** is the **first** key when iterating (the entry evicted when space is needed).
- **`get`** on a hit **refreshes** recency (entry moves to “most recently used”).
- **`set`** on a **new** key, when **`size >= CLAWQL_CACHE_MAX_ENTRIES`**, **evicts** LRU key(s) until there is room, then stores the new entry at MRU.
- **`set`** on an **existing** key updates the value and refreshes MRU **without** evicting others.

Successful **`set`** responses may include **`evicted`**: the number of keys dropped in that call (only when `> 0`).

---

## Environment variables

| Variable                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| **`CLAWQL_ENABLE_CACHE`**          | Register the **`cache`** tool (`1` / `true` / `yes`).          |
| **`CLAWQL_CACHE_MAX_ENTRIES`**     | Max distinct keys (default **10000**, min **1**, max **10M**). |
| **`CLAWQL_CACHE_MAX_VALUE_BYTES`** | Max UTF-8 size per value (default **1 MiB**, max **16 MiB**).  |

---

## Operations

| Operation    | Role                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| **`set`**    | Store `key` → `value`                                                          |
| **`get`**    | Return `hit` + `value` if present (refreshes LRU)                              |
| **`delete`** | Remove a key                                                                   |
| **`list`**   | Keys with optional `prefix` (response keys sorted for display — not LRU order) |
| **`search`** | Substring match on **keys** only (case-insensitive), optional `limit`          |

---

## Related

- **[memory-obsidian.md](memory-obsidian.md)** — vault pattern and **`memory_*`** tools
- **[integrations/cursor-vault-memory.md](integrations/cursor-vault-memory.md)** — Cursor rule/skill for vault memory
- **[deployment/deploy-k8s.md](deployment/deploy-k8s.md)** — running ClawQL in Kubernetes (each replica’s **`cache`** is isolated)
