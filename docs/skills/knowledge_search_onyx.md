# Skill: `knowledge_search_onyx` (optional)

Query Onyx enterprise search and use results in MCP workflows.

## When to Use

- You need grounded context from indexed enterprise docs.
- You want semantic search before execution/planning.
- You need source-backed summaries for decisions.

## Common Workflow

1. Ensure Onyx tool is enabled and authenticated.
2. Query with precise intent.
3. Tune `num_hits` and optional retrieval controls.
4. Summarize top evidence.
5. Persist key takeaways via `memory_ingest` when important.

## Patterns

### Pattern A: Pre-execution context fetch

- query for policy/procedure docs before API mutations

### Pattern B: Incident evidence gathering

- query by symptom + system + date context

### Pattern C: Rationale capture

- extract snippets and ingest as durable note context

## Tips

- Start with smaller hit counts and increase only when needed.
- Treat returned content as evidence input, not final truth.
- Pair with `notify` for completion updates in long flows.

## Composed Workflow

1. Run `knowledge_search_onyx` for evidence.
2. Execute downstream actions (`execute`) with grounded context.
3. Persist evidence summary via `memory_ingest` (optionally with citations).
