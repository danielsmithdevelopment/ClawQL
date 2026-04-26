---
name: clawql-memory-ingest
description: Persist durable session outcomes with memory_ingest using stable titles, append threading, and wikilinks.
---

# ClawQL memory_ingest workflows

## When to apply

- A meaningful outcome needs durable memory.
- You are ending a complex debugging or implementation thread.

## Workflow

1. Use stable `title` for topic continuity.
2. Add concise `insights` and decisions.
3. Add `wikilinks` to related notes.
4. Use `sessionId` and `append: true` for long-running threads.
5. Prefer `toolOutputsFile` for large artifacts.

## Guardrails

- Never include secrets.
- Keep raw logs in tool outputs, not insight prose.
