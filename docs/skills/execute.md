# Skill: `execute`

Use `execute` to run an operation discovered by `search`.

## When to Use

- You already have a valid operationId.
- You want the real API response (with optional top-level field filtering).
- You need deterministic action/output for automation flows.

## Common Workflow

1. Run `search` and pick operationId.
2. Build `args` with required path/query/body fields.
3. Optionally set `fields` to reduce response payload.
4. Run `execute`.
5. Validate result and continue or retry with fixed args.

## Patterns

### Pattern A: Read then mutate

- `execute(get)` first to confirm current state.
- `execute(update|patch|delete)` second with validated identifiers.

### Pattern B: Paginated list

- Start with small page size.
- Loop on next page token when present.

### Pattern C: Minimal response

- Set `fields` to only required top-level keys to keep context small.

## Tips

- Never fabricate parameters; copy names from `search` results.
- For multi-spec runs, include provider context in your planning notes.
- On failure, report both operationId and minimal argument diff.
- Remember execution path differences:
  - single-spec: GraphQL-first with REST fallback
  - multi-spec: REST-only
