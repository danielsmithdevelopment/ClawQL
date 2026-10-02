---
name: clawql-notify-workflows
description: Send actionable Slack milestones and failure notifications with the optional notify tool.
---

# ClawQL notify workflows

## When to apply

- Workflow state should be visible to humans in Slack.

## Workflow

1. Send start/failure/recovery milestones.
2. Use one thread per run (`thread_ts`).
3. Include links, owner, and next action.
4. Pair with `audit` and `memory_ingest` for traceability.

## Message structure

- status, workflow, identifier, next action, link(s).
