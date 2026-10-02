---
name: clawql-cache-workflows
description: Use the cache MCP tool (ClawQL Core, always on) as ephemeral scratch state during active sessions.
---

# ClawQL cache workflows

The **`cache`** tool is **ClawQL Core** — always registered ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75), **closed**). It is not optional; do not confuse with vault **`memory_*`**.

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
