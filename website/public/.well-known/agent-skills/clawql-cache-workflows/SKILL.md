---
name: clawql-cache-workflows
description: Use the optional cache tool as ephemeral scratch state during active sessions.
---

# ClawQL cache workflows

## When to apply

- You need temporary handoff state during a single run.

## Workflow

1. `cache.set` for short-lived keys.
2. `cache.get` during step transitions.
3. `cache.list/search` for inspection.
4. `cache.delete` when done.

## Boundary

- Cache is ephemeral process-local state.
- Use `memory_ingest` for durable memory.
