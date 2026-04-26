---
name: clawql-audit-workflows
description: Use the optional audit ring buffer for live operator breadcrumbs during workflows.
---

# ClawQL audit workflows

## When to apply

- You need lightweight in-run event traces.

## Workflow

1. `audit.append` at key milestones.
2. Use consistent category/action names.
3. Add `correlationId` for multi-step runs.
4. `audit.list` for active debugging.
5. `memory_ingest` final durable summary.

## Guardrail

- Audit is not durable/compliance storage.
