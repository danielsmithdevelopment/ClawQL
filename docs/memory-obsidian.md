# Memory, Obsidian, and the “LLM wiki” pattern

This note explains **why** ClawQL supports an Obsidian vault path and a **`memory_ingest`** tool, in terms readers may have seen described as **Karpathy-style** or **incremental wiki** memory. For all MCP tools (including **`memory_recall`**), see **[mcp-tools.md](mcp-tools.md)**.

## Beyond one-shot RAG

A common pattern in long-running agent setups is **not** to rely only on retrieving chunks into the prompt for every answer. Instead, the system **persists distilled knowledge as Markdown on disk** and updates it over time: summaries, entities, session takeaways, and links between notes. The model acts partly as an **editor of a small wiki**, not only as a stateless answerer.

That idea has been discussed publicly in connection with [Andrej Karpathy’s `llm-wiki` write-up](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (gist sketch of an LLM-maintained markdown wiki). Independent summaries and commentary also describe a **two-layer** habit: raw or clipped material in an inbox, then a **compiled** layer the agent curates into stable pages.

## Why Obsidian

**Obsidian** is a practical front-end for that compiled layer because:

- Notes are **plain Markdown files** in a folder (easy to back up, diff, and audit).
- **`[[wikilinks]]`** create a **graph**: forward links and **backlinks** without a custom database.
- You can open the same vault from the desktop app while agents write into it from automation.

ClawQL does not require Obsidian; any editor works. Obsidian is the usual reference because it matches how people **inspect** what agents stored.

## How ClawQL fits in

- **`CLAWQL_OBSIDIAN_VAULT_PATH`** points the MCP server at a vault directory (validated at startup when set).
- **`memory_ingest`** writes structured notes under **`Memory/`** (see `src/memory-ingest.ts`), with YAML frontmatter and optional **`[[wikilinks]]`** to other pages. After each successful, non-skipped write (and **`memory.db`** sync when enabled), ClawQL can refresh a top-level **`_INDEX_{Provider}.md`** in the same recall subtree — a navigable list of notes with **`[[wikilinks]]`** (disable with **`CLAWQL_MEMORY_INDEX_PAGE=0`**; label via **`CLAWQL_MEMORY_INDEX_PROVIDER`**). See **[#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)** and **[memory-db-hybrid-implementation.md](memory-db-hybrid-implementation.md)**.
- **`memory_recall`** (`src/memory-recall.ts`) is **hybrid**: it always does **keyword scoring** over Markdown (body, headings, filenames) and **walks the wikilink graph** (forward + backward) up to **`CLAWQL_MEMORY_RECALL_MAX_DEPTH`**. When **`CLAWQL_VECTOR_BACKEND`** is **`sqlite`** or **`postgres`**, **`memory.db`** is enabled, and an embedding API key is set (**`OPENAI_API_KEY`** or **`CLAWQL_EMBEDDING_API_KEY`**), it also runs an **optional vector leg**: the query is embedded via an **OpenAI-compatible `/embeddings` HTTP API** (no local embedding weights shipped in ClawQL), chunk vectors are ranked (SQLite BLOB KNN in-process and/or **Postgres + pgvector**), and hits can be seeded by similarity as well as keywords. Results include **`reason: "keyword" | "link" | "vector"`**. Defaults and tuning: **`CLAWQL_MEMORY_RECALL_*`**, **`CLAWQL_MEMORY_VECTOR_*`**, **`CLAWQL_VECTOR_*`** — see **[README.md](../README.md)** and **[hybrid-memory-backends.md](hybrid-memory-backends.md)**.

If **`CLAWQL_VECTOR_BACKEND`** is unset / **`off`** (default), recall stays **lexical + wikilinks only** — no embedding API calls.

For the **structured sidecar** (`memory.db`: chunks, optional chunk vectors, wikilink edges), see **[memory-db-schema.md](memory-db-schema.md)**, **[memory-db-hybrid-implementation.md](memory-db-hybrid-implementation.md)**, and **[hybrid-memory-backends.md](hybrid-memory-backends.md)**.

## Wikilinks and semantics

`[[Page Name]]` links are **untyped**: they mean “related page,” not “contradicts” vs “supports.” For richer semantics, teams combine tags, folders, or prose in the note body—same as in human-maintained wikis.

## See also

- **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** — full stack that combines ClawQL MCP with orchestration and vault-backed memory.
- **[Parity v1 #11](https://github.com/danielsmithdevelopment/ClawQL/issues/11)** — MCP surface aligned with the agent stack (complete). Optional vault vectors for **`memory_recall`** are implemented (**[#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16)** — remaining scope may include spec **`search`** semantics); see **[hybrid-memory-backends.md](hybrid-memory-backends.md)** and **[vector-search-design.md](vector-search-design.md)**.
