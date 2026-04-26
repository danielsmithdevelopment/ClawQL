# Skill: `ouroboros_*` (optional)

Use evolutionary loop tools for specification-first iterative execution.

Tools:

- `ouroboros_create_seed_from_document`
- `ouroboros_run_evolutionary_loop`
- `ouroboros_get_lineage_status`

## When to Use

- The task is ambiguous and needs iterative refinement.
- You want explicit seed/lineage traceability.
- You need convergence checks over multi-generation runs.

## Common Workflow

1. Build seed from source document/context.
2. Run evolutionary loop with bounded generations.
3. Inspect lineage status and generation outputs.
4. Refine seed or executor behavior when convergence is weak.

## Patterns

### Pattern A: Draft-to-spec loop

- create initial seed from requirements doc
- evolve until acceptance checks pass

### Pattern B: Controlled remediation loop

- seed includes known failing criteria
- iterate until drift/ambiguity drops under threshold

### Pattern C: Lineage inspection

- poll lineage state for run progress and output snapshots

## Tips

- Keep acceptance criteria concrete and testable.
- Use smaller generation caps early, then widen if needed.
- Enable Postgres event storage for durable lineage in production.

## Reality Check

- Keep a clear boundary between shipped behavior and roadmap assumptions when designing loop prompts and acceptance criteria.
