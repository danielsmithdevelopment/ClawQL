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
2. Set OKF `type` when known (`decision`, `context`, `error`, `runbook`, …); defaults to `context`.
3. For `type: decision`, prefer Claim / Grounds / Supports / Attacks / Decision sections — see `docs/memory/okf-decision-rationale.md`.
4. Add concise `insights` and decisions (optional `description` for frontmatter summary).
5. Add `wikilinks` to related notes; optional `correlationId` / `wormRef` for audit trails.
6. Use `sessionId` and `append: true` for long-running threads.
7. Prefer `toolOutputsFile` for large artifacts.

## Guardrails

- Never include secrets.
- Keep raw logs in tool outputs, not insight prose.
- Prefer OKF-compatible fields — see `docs/memory/okf.md`.
