# Institutional knowledge — exhaustive matter enumeration (B-7.1)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
The vault holds prior matter notes. Feature fields are **distributed across notes**
and are **not** in the note titles.

## Goal

List **every** matter that has **both**:

1. Escrow percentage **≥ 10**, and
2. Non-compete duration **longer than 18 months**

## Steps

1. Call **`clawql_memory_recall`** (multiple queries / higher `limit` / `maxDepth` as needed).
   Look for machine-readable fields in vault notes:
   - `CLAWQL_MATTER_ID=…`
   - `CLAWQL_ESCROW_PCT=…`
   - `CLAWQL_NONCOMPETE_MONTHS=…`
2. Apply the filters above. Near-misses (9% escrow, exactly 18 months NC, etc.) must
   **not** appear in the answer.
3. Write relative path `matters.json` with the **complete** matching set (order free).

## Artifact

```json
{
  "matters": ["MAT-2401", "MAT-2415", "MAT-2388", "MAT-2450", "MAT-2462"],
  "criteria": {
    "escrow_pct_min": 10,
    "noncompete_months_gt": 18
  },
  "source": "memory_recall",
  "search_sufficiency": "short note on why the set is complete"
}
```

## Rules

- Ignore `decoy/`. Partial lists fail. Extra matter IDs fail.
- Inventing `matters.json` without a real `clawql_memory_recall` tool_use fails.
- Stop after writing `matters.json`.
