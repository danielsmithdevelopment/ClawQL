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

## `stream.changed` / change detection

When using schedule as an MCP Events source, set `action.synthetic_test.change_detection`:

```json
{
  "watch_fields": ["items.title", "items.state"],
  "exclude_paths": ["items.updated_at"],
  "array_sort_keys": { "items": "id" },
  "conditional_requests": true
}
```

Hash only the projection. Re-read the full snapshot with `schedule` get → `change_detection_state.last_projection`.
