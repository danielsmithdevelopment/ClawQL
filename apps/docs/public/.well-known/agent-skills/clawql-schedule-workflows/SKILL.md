---
name: clawql-schedule-workflows
description: Build recurring synthetic checks with schedule, validate via dry_run, and pair with notify.
---

# ClawQL schedule workflows

## When to apply

- You need persisted recurring synthetic monitoring jobs.

## Workflow

1. Create schedule with synthetic action.
2. Trigger with `dry_run: true`.
3. Fix assertions/targets as needed.
4. Enable recurring run.
5. Pair failure path with `notify`.
6. Record lessons via `memory_ingest`.
