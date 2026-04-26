---
name: clawql-ouroboros-workflows
description: Run iterative specification-first workflows with ouroboros_* tools and lineage checks.
---

# ClawQL ouroboros workflows

## When to apply

- Task requirements are ambiguous and need iterative convergence.

## Workflow

1. Create seed from source document/context.
2. Run evolutionary loop with bounded generations.
3. Check lineage status for progress and convergence.
4. Refine seed constraints and rerun when needed.
5. Persist final outcomes with `memory_ingest`.

## Guardrails

- Keep acceptance criteria concrete.
- Separate shipped behavior from roadmap assumptions.
