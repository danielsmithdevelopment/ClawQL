# Institutional knowledge — exhaustive matter enumeration (B-7.1-blind)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
The same matter notes are available in the workspace for every run. When ClawQL
memory is available, the vault may expose structured field tags for **exact**
predicate queries (not keyword similarity alone).

## Goal

List **every** matter that has **both**:

1. Escrow percentage **≥ 10**, and
2. Non-compete duration **longer than 18 months**

## Steps

1. When `clawql_memory_recall` is available, prefer exact field filters over
   keyword/semantic search. Keyword hits include near-misses (e.g. 9% escrow or
   exactly 18 months NC) that fail the criteria and zero the score.
2. You may also read markdown under `.openbench/memory-seed/` (nested
   `clients/*/matters/`; ignore `decoy/`) if memory tools are unavailable.
   Workspace notes are **prose** (~120 files); numbers may be written as words.
3. Near-misses (9% escrow, exactly 18 months NC, missing escrow) must **not**
   appear in the answer.
4. Write **relative** path `matters.json` (not `/tmp/…`) with the complete
   matching set and a non-empty `source`. Do not stop after a partial list —
   verify the filter returned every match (including edge cases just above the
   thresholds) before writing.

## Artifact

```json
{
  "matters": ["MAT-XXXX", "MAT-YYYY"],
  "criteria": {
    "escrow_pct_min": 10,
    "noncompete_months_gt": 18
  },
  "source": "memory_recall",
  "search_sufficiency": "how you decided the set is complete"
}
```

## Scoring

- Partial credit: `SCORE = hits / N`. Headline: `MATTERS_FOUND: k/N`.
- Extra / near-miss IDs → `0/N`. Empty `source` → 0.
- When memory tools are available, live grading requires a real
  `clawql_memory_recall` tool_use.

## Rules

- Ignore `decoy/`. Do not invent matter IDs.
- Stop only after writing relative `matters.json` with the complete set.
