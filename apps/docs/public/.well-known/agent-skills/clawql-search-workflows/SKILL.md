---
name: clawql-search-workflows
description: Use ClawQL search to discover correct operationIds before execute calls, especially in multi-provider workflows.
---

# ClawQL search workflows

## When to apply

- You know intent but not `operationId`.
- You need parameter hints before calling `execute`.
- You want discovery-only planning before any mutations.

## Workflow

1. Run `search` with concrete verb + domain terms.
2. Review top candidates and required params.
3. Refine query if ambiguous.
4. Pass validated `operationId` to `execute`.

## Guardrails

- Prefer `search`-first over guessed operation IDs.
- In complex runs, do all discovery first, then execute.
