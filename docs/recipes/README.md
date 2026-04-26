# Recipes

Hands-on workflow recipes for common ClawQL use cases.

These are practical playbooks you can copy, adapt, and run with MCP tools.

## Recipe Collections

- `api-operations-recipes.md`
- `incident-response-recipes.md`
- `memory-and-knowledge-recipes.md`
- `monitoring-and-schedule-recipes.md`
- `migration-and-rollout-recipes.md`
- `collaboration-and-notifications-recipes.md`
- `ouroboros-recipes.md`

## Quick Start

If you are new, start here:

1. `api-operations-recipes.md`
2. `memory-and-knowledge-recipes.md`
3. `incident-response-recipes.md`

## Workflow Conventions Used

- Discover first: `search` before `execute` unless operationId is already known.
- Durable memory: use `memory_ingest` for final outcomes.
- Ephemeral scratch: use `cache` only for same-session temporary state.
- Operator breadcrumbs: use `audit` for live tracing, not long-term storage.
- Team visibility: use `notify` for milestone/failure updates.
