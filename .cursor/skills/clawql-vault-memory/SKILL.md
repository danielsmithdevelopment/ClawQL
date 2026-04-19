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

When **`CLAWQL_ENABLE_CACHE`** is set, the server exposes **`cache`**: **ephemeral** key/value in this process, **LRU**-bounded, **no** Markdown / **`memory.db`**. Use it for session scratch state only. For durable notes and graph recall, use **`memory_ingest`** / **`memory_recall`**. Repo reference: **[`docs/cache-tool.md`](../../../docs/cache-tool.md)** (relative from this skill file in the ClawQL repo).

When **`CLAWQL_ENABLE_AUDIT`** is set, the server exposes **`audit`**: **ephemeral** in-process event ring buffer — **not** the vault and **not** compliance-grade alone. Use **`memory_ingest`** for durable, human-inspectable trails. Repo reference: **[`docs/enterprise-mcp-tools.md`](../../../docs/enterprise-mcp-tools.md)** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)).

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

## APIs & references

- Paths, RPC names, links to repo files.

## Risks & caveats

- What breaks, versioning, known grpcurl quirks.

## Follow-ups

- [ ] Next steps
```

Put **raw** command output, stack traces, or large JSON in **`toolOutputs`**, not inside **`insights`**, unless tiny.

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
memory_ingest: title (required), insights?, conversation?, toolOutputs? (string | string[]), wikilinks? (string[]), sessionId?, append? (boolean)
memory_recall: query (required), limit?, maxDepth?, minScore?
```

For implementation details (SQLite/pgvector, index), see `docs/memory-db-hybrid-implementation.md` in the repo when relevant.
