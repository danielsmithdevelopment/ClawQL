# Skill: `cache` (optional)

Use ephemeral in-process key/value scratch state during a single active server session.

## When to Use

- Temporary coordination data inside one task/session.
- Small working sets you do not want in durable memory.
- Intermediate values between tool calls.

## Common Workflow

1. `set` key(s) for transient state.
2. `get` for step-to-step handoff.
3. `list`/`search` for quick inspection.
4. `delete` keys when done.

## Patterns

### Pattern A: Multi-step checklist scratchpad

- cache pending IDs, step counters, temporary summaries

### Pattern B: API pagination cursor handoff

- cache latest cursor token during iterative calls

### Pattern C: Session-local issue shortlist

- hold temporary candidate items before final selection

## Tips

- `cache` is not durable and not shared across process restarts/replicas.
- Do not store secrets.
- Use `memory_ingest` for anything that must persist.

## Boundary Rule

- Use `cache` for "this-session-only scratch."
- Use `memory_ingest` for "future sessions must remember this."
