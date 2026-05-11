---
name: clawql-audit-workflows
description: >-
  Workflow recipes for the ClawQL MCP audit tool. The audit tool is ClawQL Core
  (always registered — no CLAWQL_ENABLE_AUDIT); this skill is optional guidance for
  append/list/clear patterns during multi-step runs.
---

# ClawQL audit workflows

## When to apply

- You want structured **`audit.append`** / **`audit.list`** breadcrumbs during a workflow (the tool is already available on every ClawQL MCP server).

## Workflow

1. `audit.append` at key milestones.
2. Use consistent category/action names.
3. Add `correlationId` for multi-step runs.
4. `audit.list` for active debugging.
5. `memory_ingest` final durable summary.

## Guardrail

- Audit is not durable/compliance storage.
