# Cursor IDE: vault memory (rule, skill, and MCP tools)

This document explains how **ClawQL’s Obsidian vault tools** (`memory_ingest`, `memory_recall`) connect to **Cursor** via a project **rule** and **skill**, so agents persist and recall context consistently.

---

## Prerequisites

| Requirement                         | Role                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL MCP** configured in Cursor | The agent can call MCP tools (stdio or HTTP, per your setup).                                                                                                                       |
| **`CLAWQL_OBSIDIAN_VAULT_PATH`**    | Points the server at a writable vault directory. Without it, vault tools return an error; see **[README.md](../../README.md)** and **[memory-obsidian.md](../memory-obsidian.md)**. |

---

## Three layers (how they fit together)

### 1. MCP tools (ClawQL server)

- **`memory_ingest`** — Writes structured Markdown under **`Memory/`** in the vault (YAML frontmatter, optional **`[[wikilinks]]`**, dedup by content hash). Optional **`toolOutputsFile`**: point at a small path string so the **server** reads a large file from disk (allowlisted via **`CLAWQL_MEMORY_INGEST_FILE_ROOTS`**)—avoids multi‑hundred‑KB tool JSON in Cursor. See **[mcp-tools.md](../mcp-tools.md)** and implementation notes in **[memory-obsidian.md](../memory-obsidian.md)**.
- **`memory_recall`** — Keyword search, wikilink graph walks, optional vector leg when configured. See **[memory-db-hybrid-implementation.md](../memory-db-hybrid-implementation.md)** for the **`memory.db`** sidecar.
- **`cache`** (**ClawQL Core**, always registered) — **Ephemeral LRU** key/value in this process only — **not** the vault. Use for temporary session state; use **`memory_ingest`** / **`memory_recall`** (set **`CLAWQL_ENABLE_MEMORY=0`** to hide vault tools) for anything that must persist. See **[cache-tool.md](../cache-tool.md)**.
- **`audit`** (always on) — **Ephemeral** in-process event ring buffer — **not** the vault and **not** a compliance system by itself; use **`memory_ingest`** for durable trails. See **[enterprise-mcp-tools.md](../enterprise-mcp-tools.md)** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)).

These tools are **transport-agnostic**: any MCP client can call them. Cursor’s agent is one such client.

### 2. Cursor rule (always on)

| File                                                                                    | Purpose                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`.cursor/rules/clawql-vault-memory.mdc`](../.cursor/rules/clawql-vault-memory.mdc)** | **`alwaysApply: true`** — reminds the agent to use **`memory_recall`** early and **`memory_ingest`** after important outcomes, and points to the skill for **deep** ingests. |

Rules live in the repo and apply to chats in this workspace (when Cursor loads project rules).

### 3. Cursor skill (deep playbook)

| File                                                                                                | Purpose                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[`.cursor/skills/clawql-vault-memory/SKILL.md`](../.cursor/skills/clawql-vault-memory/SKILL.md)** | Skill **`clawql-vault-memory`**: field-by-field tool usage, structured **`insights`** templates, wikilink strategy, **`sessionId`** / **`append`**, recall parameters, anti-patterns. |

Cursor uses the skill’s YAML **`description`** to decide when to attach it; you can also say explicitly: _“use the clawql-vault-memory skill for this ingest.”_

**Rule vs skill:** the **rule** establishes the _habit_ (recall + ingest). The **skill** holds the _procedure_ for thorough notes.

---

## For humans using Cursor

1. **Open this repo** in Cursor so **`.cursor/rules/`** and **`.cursor/skills/`** load.
2. **Configure ClawQL MCP** and the vault path so tools succeed.
3. **Chat as usual** — the rule nudges the agent toward recall/ingest.
4. For a **rich vault note**, ask the model to follow the **clawql-vault-memory** skill (or paste a pointer to **`SKILL.md`**).
5. **Manual edits** — you can always edit **`Memory/*.md`** directly in Obsidian or any editor; the MCP tools are optional automation on top of plain files.

**Manual MCP invocation:** There is no separate ClawQL CLI for `memory_ingest`. Options: ask the agent in chat, use any MCP-capable client, or edit Markdown yourself. See discussion in repo issues / README as needed.

**Personal vs repo scope:** To reuse the same skill in **other** projects, copy **`.cursor/skills/clawql-vault-memory/`** or install a copy under **`~/.cursor/skills/`** (Cursor personal skills).

---

## Related documentation

| Doc                                                                             | Topic                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| **[memory-obsidian.md](../memory-obsidian.md)**                                 | Why a vault, `Memory/`, wikilinks, index pages.    |
| **[mcp-tools.md](../mcp-tools.md)**                                             | All MCP tools, JSON-shaped examples.               |
| **[cache-tool.md](../cache-tool.md)**                                           | **`cache`** vs vault memory, LRU, env.             |
| **[enterprise-mcp-tools.md](../enterprise-mcp-tools.md)**                       | Optional **`audit`** vs vault; enterprise roadmap. |
| **[memory-db-hybrid-implementation.md](../memory-db-hybrid-implementation.md)** | `memory.db`, recall implementation.                |

---

## Repo file reference

| Path                                          | Type                                |
| --------------------------------------------- | ----------------------------------- |
| `.cursor/rules/clawql-vault-memory.mdc`       | Cursor rule (always apply)          |
| `.cursor/skills/clawql-vault-memory/SKILL.md` | Cursor skill (deep ingest + recall) |
| `src/memory-ingest.ts`                        | `memory_ingest` implementation      |
| `src/memory-recall.ts`                        | `memory_recall` implementation      |
