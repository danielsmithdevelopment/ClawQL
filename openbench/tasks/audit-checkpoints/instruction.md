# Audit checkpoint trail

Record a short in-process audit trail for this run, then export it.

## Steps (requires `audit` tool)

1. `audit` append with `category=openbench`, `action=start`,
   `summary=openbench-audit-start`, `correlationId=openbench-audit-1`.
2. `audit` append with `category=openbench`, `action=checkpoint`,
   `summary=openbench-audit-mid`, `correlationId=openbench-audit-1`.
3. `audit` append with `category=openbench`, `action=finish`,
   `summary=openbench-audit-done`, `correlationId=openbench-audit-1`.
4. `audit` list (limit ≥ 3).
5. Write `trail.json` from the list (must include the three summaries).

## Artifact

```json
{
  "correlationId": "openbench-audit-1",
  "summaries": [
    "openbench-audit-start",
    "openbench-audit-mid",
    "openbench-audit-done"
  ]
}
```

## Rules

- Ignore `decoy/`.
- Passing requires `audit` append + list tool calls in this run.
- Stop after writing `trail.json`.
