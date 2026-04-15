# Memory, Obsidian, and the “LLM wiki” pattern

This note explains **why** ClawQL supports an Obsidian vault path and a **`memory_ingest`** tool, in terms readers may have seen described as **Karpathy-style** or **incremental wiki** memory.

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
- **`memory_ingest`** writes structured notes under **`ClawQL/Memory/`** (see implementation in `src/memory-ingest.ts`), with YAML frontmatter and optional **`[[wikilinks]]`** to other pages.

This is intentionally **lightweight**: no embedding database inside ClawQL for ingest; the vault remains the source of truth. **`memory_recall`** (planned) can add retrieval over these files in a later iteration.

## Wikilinks and semantics

`[[Page Name]]` links are **untyped**: they mean “related page,” not “contradicts” vs “supports.” For richer semantics, teams combine tags, folders, or prose in the note body—same as in human-maintained wikis.

## See also

- **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** — full stack that combines ClawQL MCP with orchestration and vault-backed memory.
- **[Parity milestone #11](https://github.com/danielsmithdevelopment/ClawQL/issues/11)** — tracking **`memory_recall`** and related parity items.
