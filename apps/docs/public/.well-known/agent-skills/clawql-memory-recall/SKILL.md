---
name: clawql-memory-recall
description: Recall relevant vault context before deep work using focused queries and graph depth controls.
---

# ClawQL memory_recall workflows

## When to apply

- Before deep tasks or decisions.
- When user references prior sessions.

## Workflow

1. Query with specific component/feature/error terms.
2. Start with low `limit`.
3. Increase `maxDepth` for wikilink context.
4. Raise `minScore` if noisy.
5. Summarize hits before acting.

## Pattern

- `memory_recall` -> work (`search`/`execute`) -> `memory_ingest`.
