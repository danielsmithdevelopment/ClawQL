# Institutional knowledge — exhaustive matter enumeration (B-7.1)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
The same matter notes are available in the workspace for every run. When ClawQL
memory is available, the vault also holds structured field tags for faster,
more complete recall.

## Goal

List **every** matter that has **both**:

1. Escrow percentage **≥ 10**, and
2. Non-compete duration **longer than 18 months**

## Steps

1. **Search exhaustively.** Do **not** stop after the first few hits.
   - Prefer **`clawql_memory_recall`** when available (structured `CLAWQL_*`
     tags in the vault). Use **multiple** queries with `limit` up to 50.
   - You may also read markdown notes under `.openbench/memory-seed/`
     (nested `clients/*/matters/`; ignore `decoy/`). Workspace notes are
     **prose** (~120 files); numbers may be written as words.
2. Fields to collect: matter id, escrow %, non-compete months.
3. Near-misses (e.g. 9% escrow, exactly 18 months NC, missing escrow) must
   **not** appear in the answer.
4. Write **relative** path `matters.json` (not `/tmp/…`) with the complete
   matching set and a non-empty `source`.

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
`workspace_notes` when you only read seed files.

## Scoring

- Partial credit: `SCORE = hits / N`. Headline: `MATTERS_FOUND: k/N`.
- Extra / near-miss IDs → `0/N`. Empty `source` → 0.
- When memory tools are available, live grading requires a real
  `clawql_memory_recall` tool_use.

## Rules

- Ignore `decoy/`. Do not invent matter IDs.
- Stop only after writing relative `matters.json` with the complete set.
