# Skill: `memory_recall`

Retrieve relevant prior context from vault notes before making changes or claims.

## When to Use

- Start of a complex task.
- User references previous work.
- You need decisions/history not in current files.
- Architecture tracing when hybrid code graph is enabled (`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1` or `includeCodeGraph: true`).

## Common Workflow

1. Query with concrete terms (feature, incident code, component).
2. Start with low `limit` (5-10).
3. Increase `maxDepth` when wikilink context matters.
4. Raise `minScore` if matches are noisy.
5. Summarize hits before acting.
6. When hybrid code graph is on, review **`codeGraphHits`** for matching symbols and file paths alongside vault snippets.

## Patterns

### Pattern A: Resume prior implementation

- Query: feature name + issue id + subsystem

### Pattern B: Incident continuity

- Query: error code + service name + date range keywords

### Pattern C: Architecture recall

- Query: module name + "decision" + "tradeoff"
- Optional: enable hybrid code graph after **`codegraph_index`** for symbol hits on the same query

### Pattern D: Code structure + narrative

1. Ensure repo is indexed (`codegraph_index` or Graphify import).
2. `memory_recall` with `includeCodeGraph: true` (or env hybrid flag).
3. Use vault snippets for *why* and **`codeGraphHits`** for *where* in source.

## Tips

- Use multiple focused recalls rather than one broad query.
- Distinguish direct keyword hits from linked-context hits.
- Pair with `memory_ingest` after finishing new work.
- For pure call-graph tracing without vault context, prefer **`codegraph_path`** / **`codegraph_neighbors`** directly.

## Composed Workflow

- For backlog reconciliation sessions:
  1. `memory_recall` for prior context
  2. source-of-truth tool calls (`search`/`execute`/GitHub)
  3. `memory_ingest` final decisions and links
