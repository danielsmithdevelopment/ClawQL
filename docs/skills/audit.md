# Skill: `audit` (optional)

Record lightweight operational events in an in-process ring buffer.

## When to Use

- You need short-term operator/event breadcrumbs.
- You want quick traceability during active runs/tests.
- You are validating workflow sequencing.

## Common Workflow

1. `append` events at key milestones.
2. Use consistent `category` and `action`.
3. Add `correlationId` for multi-step flows.
4. `list` recent events during debugging.
5. `clear` when resetting test/operator context.

## Patterns

### Pattern A: Workflow milestone trail

- append on start, checkpoint, completion/failure

### Pattern B: Incident triage trace

- append hypothesis and remediation checkpoints

### Pattern C: Pre-release smoke validation

- append test cases and outcomes, then export summary elsewhere

## Tips

- `audit` is not durable storage.
- For durable postmortems, also write `memory_ingest` notes.
- Keep entries short and structured.

## Composed Workflow

- `audit.append` during active workflow -> `notify` on important failures -> `memory_ingest` durable summary.
