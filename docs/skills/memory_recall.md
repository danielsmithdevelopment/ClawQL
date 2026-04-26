# Skill: `memory_recall`

Retrieve relevant prior context from vault notes before making changes or claims.

## When to Use

- Start of a complex task.
- User references previous work.
- You need decisions/history not in current files.

## Common Workflow

1. Query with concrete terms (feature, incident code, component).
2. Start with low `limit` (5-10).
3. Increase `maxDepth` when wikilink context matters.
4. Raise `minScore` if matches are noisy.
5. Summarize hits before acting.

## Patterns

### Pattern A: Resume prior implementation

- Query: feature name + issue id + subsystem

### Pattern B: Incident continuity

- Query: error code + service name + date range keywords

### Pattern C: Architecture recall

- Query: module name + "decision" + "tradeoff"

## Tips

- Use multiple focused recalls rather than one broad query.
- Distinguish direct keyword hits from linked-context hits.
- Pair with `memory_ingest` after finishing new work.

## Composed Workflow

- For backlog reconciliation sessions:
  1. `memory_recall` for prior context
  2. source-of-truth tool calls (`search`/`execute`/GitHub)
  3. `memory_ingest` final decisions and links
