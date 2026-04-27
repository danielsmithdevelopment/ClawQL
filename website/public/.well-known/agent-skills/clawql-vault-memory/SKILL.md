---
name: clawql-vault-memory
description: >-
  Deep ClawQL Obsidian vault workflows using memory_ingest and memory_recall MCP
  tools—structured insights, wikilink graphs, session threading, verbatim captures,
  and recall queries. Use when persisting important context, building a knowledge
  graph, starting tasks that may depend on prior vault notes, or when the user
  mentions Obsidian, the vault, memory, or long-running project context.
---

# ClawQL vault memory (deep ingest + recall)

## When to apply

- **Ingest:** After meaningful outcomes—decisions, debugging conclusions, API/env contracts, runbooks, user preferences, cross-feature relationships.
- **Recall:** Before deep work, when the user references past work, or when vault context could reduce wrong assumptions.

If **ClawQL MCP** is not configured or **`CLAWQL_OBSIDIAN_VAULT_PATH`** is unset, say so briefly and continue without blocking.

### Cursor Agent: `call_mcp_tool` server parameter

Your `mcp.json` key can stay **`clawql`** (that is what Settings / docs refer to). The **agent `call_mcp_tool` API** does **not** accept that bare string: Cursor registers the server under a **scoped id** derived from where the config lives:

| Config file | Typical `call_mcp_tool` **`server`** value |
|-------------|--------------------------------------------|
| `~/.cursor/mcp.json` | **`user-clawql`** |
| `${workspaceFolder}/.cursor/mcp.json` | **`workspace-clawql`** |

There is **no** supported `mcp.json` field to rename this to bare `clawql` for `call_mcp_tool`—the prefix is host behavior to avoid collisions (e.g. the same key in user vs project config). If both files define `clawql`, two scoped servers can exist; use the one that matches where you configured ClawQL for this workspace.

**Never store secrets:** tokens, API keys, passwords, private keys, or raw session cookies. Summarize redacted config instead.

---

## Tool capabilities (what the server actually does)

### `memory_ingest`

| Field              | Use                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`title`**        | Required. Drives the H1 and the filename slug under `Memory/<slug>.md`. Prefer stable, descriptive titles (e.g. `gRPC MCP ListTools metadata`) so updates append to the same page. |
| **`insights`**     | Primary prose. Markdown is fine. This is where **semantic tagging** and structure live (see below).                                                                                |
| **`conversation`** | Longer transcript or chat summary; stored in a fenced block under **Conversation**.                                                                                                |
| **`toolOutputs`**  | Verbatim logs: command output, errors, JSON snippets, diffs—each string becomes a block; multiple strings are separated for readability.                                           |
| **`toolOutputsFile`** | **Server-side only:** a path (absolute or relative to the ClawQL process **`cwd`**) the **MCP server** reads as UTF-8 and uses as **`toolOutputs`**. Use for **large** bodies so the model only passes a **short path** in the tool call (not the file contents). Must fall under an allowlist (**`CLAWQL_MEMORY_INGEST_FILE_ROOTS`**, or default realpath of **`cwd`**). If both **`toolOutputsFile`** and **`toolOutputs`** are set, the **file wins**. Disable reads with **`CLAWQL_MEMORY_INGEST_FILE=0`**. |
| **`wikilinks`**    | List of **other vault note titles** (plain names; `[[brackets]]` optional). Rendered as **`## Related`** with `- [[Note Name]]` bullets—this is the **graph** for Obsidian.        |
| **`sessionId`**    | Optional label for the section header (threads multi-step work).                                                                                                                   |
| **`append`**       | Default **true**: new section appended to an existing file with the same slug. Set **false** only to replace the file body (rare).                                                 |

**Dedup:** Identical payload hash → ingest is skipped (no duplicate sections).

**Frontmatter (automatic):** New files get YAML with `title`, `date`, `tags: [clawql-ingest]`, `clawql_ingest: true`. The MCP tool does **not** accept custom YAML tags—put extra tagging **inside `insights`** (see Tagging).

### `memory_recall`

| Field          | Use                                                                              |
| -------------- | -------------------------------------------------------------------------------- |
| **`query`**    | Keywords / phrase; tokenized for scoring across vault Markdown.                  |
| **`limit`**    | Max notes (default from env, often ~10).                                         |
| **`maxDepth`** | Wikilink hops from keyword hits (default from env). Higher = more graph context. |
| **`minScore`** | Raise to filter weak keyword matches.                                            |

Results include path, score, depth, reason (`keyword` | `link` | `vector`), and snippet. Use hits to ground answers or decide what to open next.

### Optional `cache` (not vault)

**`cache`** (**ClawQL Core**, always registered) is **ephemeral** key/value in this process, **LRU**-bounded, **no** Markdown / **`memory.db`**. **`memory_ingest`** / **`memory_recall`** are on by default; set **`CLAWQL_ENABLE_MEMORY=0`** to hide, and use a configured vault to persist. Repo reference: **[`docs/cache-tool.md`](../../../docs/cache-tool.md)**.

The server always exposes **`audit`**: **ephemeral** in-process event ring buffer — **not** the vault and **not** compliance-grade alone. Use **`memory_ingest`** for durable, human-inspectable trails. Repo reference: **[`docs/enterprise-mcp-tools.md`](../../../docs/enterprise-mcp-tools.md)** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)).

When **`CLAWQL_ENABLE_NOTIFY`** is set, the server exposes **`notify`**: Slack **`chat.postMessage`** — **not** vault storage; use for completion signals alongside **`memory_ingest`** when you also want a durable note. Repo reference: **[`docs/notify-tool.md`](../../../docs/notify-tool.md)** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)).

---

## Thorough ingest pattern (recommended structure)

Use **`insights`** as the main artifact. A solid long-form layout:

```markdown
## Summary

One paragraph: what this note captures and why it matters.

## Tags / topics

#grpc #mcp #clawql (Obsidian-compatible hashtags; add domain tags freely)

## Decisions

- Bullet decisions with rationale.

## Commands / env

- `VAR=value` …
- `CLAWQL_MEMORY_INGEST_FILE_ROOTS=/abs/path/to/ClawQL` — optional comma-separated allowlist for **`toolOutputsFile`** (default: process **`cwd`** only). `CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES` (default 10M). `CLAWQL_MEMORY_INGEST_FILE=0` disables path-based reads.

## APIs & references

- Paths, RPC names, links to repo files.

## Risks & caveats

- What breaks, versioning, known grpcurl quirks.

## Follow-ups

- [ ] Next steps
```

Put **raw** command output, stack traces, or large JSON in **`toolOutputs`** (or, when the text is too large to pass in MCP tool JSON, **`toolOutputsFile`** on the server), not inside **`insights`**, unless tiny.

### Wikilinking strategy

- Link **related note titles** that already exist or will exist (`wikilinks`: `["gRPC README", "mcp-grpc-transport"]`).
- Prefer **consistent title strings** so Obsidian resolves `[[...]]` edges predictably.
- For cross-repo concepts, one note can link to **ADR**, **runbook**, and **feature** notes.

### Session threading

- Reuse the same **`title`** across a multi-step task and set **`sessionId`** per ingest (e.g. `session-2026-04-17-grpc`) so section headers show lineage.

### Append vs new note

- **Same topic, new facts:** same **`title`**, **`append: true`** (default).
- **New topic:** new **`title`**.
- **Full replace** (destructive): **`append: false`**—overwrites file body; use sparingly.

---

## Recall-first workflow

1. **`memory_recall`** with a focused **`query`** (feature name, error string, component).
2. Tune **`maxDepth`** if graph context matters (dependencies between notes).
3. Summarize relevant hits before editing code or answering from memory alone.

---

## Anti-patterns

- Dumping entire chats into **`insights`** without a **Summary**—hard to scan later.
- **`wikilinks`** to titles that do not match vault pages—broken graph edges.
- Secrets in any field.
- Relying on custom frontmatter **tags** via the tool—they are fixed; use hashtags or a **Tags** line in **`insights`** instead.

---

## Minimal API reminder

```text
memory_ingest: title (required), insights?, conversation?, toolOutputs? (string | string[]), toolOutputsFile? (path on server), wikilinks? (string[]), sessionId?, append? (boolean)
memory_recall: query (required), limit?, maxDepth?, minScore?
```

Repo details: **[`docs/mcp-tools.md`](../../../docs/mcp-tools.md)** (section **memory_ingest**).

For implementation details (SQLite/pgvector, index), see `docs/memory-db-hybrid-implementation.md` in the repo when relevant.
