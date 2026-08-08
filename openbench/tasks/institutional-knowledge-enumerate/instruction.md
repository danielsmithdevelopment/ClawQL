# Institutional knowledge — exhaustive matter enumeration (B-7.1)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
Prior matter notes live in the vault / workspace. Feature fields are **distributed
across nested notes** and are **not** in the filenames.

## Goal

List **every** matter that has **both**:

1. Escrow percentage **≥ 10**, and
2. Non-compete duration **longer than 18 months**

## Steps

1. **Search exhaustively.** Do **not** stop after the first few hits.
   - Prefer **`clawql_memory_recall`** when available. Issue **multiple** queries
     (different keywords / clients) with `limit` up to 50 until the firm notes
     are covered — a single recall may not return the whole vault.
   - If memory tools are unavailable, walk **every** markdown note under
     `.openbench/memory-seed/` (including nested `clients/*/matters/`; ignore
     `decoy/`). There are **~120** notes; you must check each note’s fields
     before finishing (filenames do not encode the criteria).
2. Machine-readable fields to collect:
   - `CLAWQL_MATTER_ID=…`
   - `CLAWQL_ESCROW_PCT=…`
   - `CLAWQL_NONCOMPETE_MONTHS=…`
3. Apply the filters above. Near-misses (e.g. 9% escrow, exactly 18 months NC,
   missing escrow) must **not** appear in the answer.
4. Write **relative** path `matters.json` (exactly that name — not `/tmp/…` or an
   absolute path) with the **complete** matching set (order free). Always include
   a non-empty `source` string.

## Artifact

```json
{
  "matters": ["MAT-XXXX", "MAT-YYYY"],
  "criteria": {
    "escrow_pct_min": 10,
    "noncompete_months_gt": 18
  },
  "source": "memory_recall",
  "search_sufficiency": "short note on why the set is complete — how many notes you checked"
}
```

Use `source`: `memory_recall` when you used vault tools; `filesystem` or
`workspace_notes` when you read seed files. Use placeholder IDs in the schema
only. Discover real IDs from the notes.

## Scoring

- **Partial credit:** `SCORE = hits / N` (how many of the matching matters you found).
- Checker also emits **`MATTERS_FOUND: k/N`** — the headline diagnostic.
- Extra / near-miss IDs → `0/N` and `SCORE: 0.0`.
- Live on-arm grading requires a real `clawql_memory_recall` tool_use when memory tools are available.
- Empty `source` → score 0.

## Rules

- Ignore `decoy/`. Prefer the complete set; partial sets score proportionally.
- Do not invent matter IDs. Exhaust the corpus before writing `matters.json`.
- Stop only after writing relative `matters.json` with the complete set and a
  non-empty `source`.
