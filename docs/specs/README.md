# Specs lifecycle

Specs under `docs/specs/` use a single **status** vocabulary so agents and reviewers can tell draft from shipped work.

## Allowed `status` values

| Value        | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `draft`      | Design only; not a shipping contract                           |
| `accepted`   | Design agreed; implementation may be partial                   |
| `shipping`   | Implementation in flight or partial in a release train         |
| `shipped`    | Behavior is in a released line; keep the spec as the contract  |
| `superseded` | Replaced by another spec or product decision; keep for history |
| `archived`   | No longer active; do not cite for new work                     |

Put the value in YAML frontmatter:

```yaml
---
status: draft
title: "Example"
---
```

Or as a prose line near the top: `**Status:** draft`. Prefer frontmatter for new and updated specs. Older spellings (`Spec v0.1`, `Draft · August 2026`, dated strings) are fine until edited; map them to the table when you touch the file.

## Purged in 8.0.0

PageIndex and CodeGraph were removed in the 8.0 honesty purge. Specs and catalog entries that still mention them should use `status: superseded` and point at [8.0.0 purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md). Do not treat those capabilities as live routing targets.

## Index

See each subdirectory `README.md` (billing, memory, network, …) for the local table of specs.
