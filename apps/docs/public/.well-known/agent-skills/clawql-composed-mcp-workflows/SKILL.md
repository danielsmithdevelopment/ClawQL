---
name: clawql-composed-mcp-workflows
description: Apply proven end-to-end recipes combining search/execute, memory, notify, schedule, and optional tools.
---

# ClawQL composed MCP workflows

## When to apply

- The task spans multiple tools and needs a repeatable pattern.

## Core recipes

- Safe API change rollout: `search -> execute(read) -> execute(write) -> execute(read) -> memory_ingest`.
- Incident triage: `memory_recall -> search/execute -> audit -> notify -> memory_ingest`.
- Knowledge-grounded ops: `knowledge_search_onyx -> execute -> memory_ingest -> notify`.
- Synthetic monitoring: `schedule(create/trigger dry_run) -> notify -> memory_ingest`.

## Source

- Canonical recipe library: `docs/recipes/README.md`
