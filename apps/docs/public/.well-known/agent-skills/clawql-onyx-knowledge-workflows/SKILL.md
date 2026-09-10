---
name: clawql-onyx-knowledge-workflows
description: Use knowledge_search_onyx to ground workflows in enterprise evidence before execution.
---

# ClawQL knowledge_search_onyx workflows

## When to apply

- Decisions/actions require enterprise-document grounding.

## Workflow

1. Query Onyx for relevant evidence.
2. Summarize key supporting snippets.
3. Execute downstream API actions.
4. Persist evidence summary with `memory_ingest`.
5. Notify completion as needed.

## Guardrail

- Treat retrieved content as evidence input, not guaranteed truth.
