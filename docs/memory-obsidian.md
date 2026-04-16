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
- **`memory_ingest`** writes structured notes under **`Memory/`** (see `src/memory-ingest.ts`), with YAML frontmatter and optional **`[[wikilinks]]`** to other pages.
- **`memory_recall`** (`src/memory-recall.ts`) does **keyword scoring** over Markdown (plus headings / filenames) and **walks the wikilink graph** (forward + backward) up to a configurable depth. It does **not** load embedding models—tuned for low latency in agent loops. Tune defaults with **`CLAWQL_MEMORY_RECALL_*`** env vars (see README).

The design stays **lightweight**: the vault remains the source of truth; retrieval is “good enough” lexical + graph context rather than semantic vectors in-process.

For the **structured sidecar** (`memory.db`: chunks + wikilink edges for hybrid / sqlite-vec work), see **[memory-db-schema.md](memory-db-schema.md)** and the full build narrative **[memory-db-hybrid-implementation.md](memory-db-hybrid-implementation.md)**.

## Wikilinks and semantics

`[[Page Name]]` links are **untyped**: they mean “related page,” not “contradicts” vs “supports.” For richer semantics, teams combine tags, folders, or prose in the note body—same as in human-maintained wikis.

## See also

- **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** — full stack that combines ClawQL MCP with orchestration and vault-backed memory.
- **[Parity v1 #11](https://github.com/danielsmithdevelopment/ClawQL/issues/11)** — MCP surface aligned with the agent stack (complete); future retrieval work may follow **[#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16)** ([design: vector backends](vector-search-design.md)).
