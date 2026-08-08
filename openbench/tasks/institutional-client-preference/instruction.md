# Institutional knowledge — client preference reconstruction (B-7.2)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
Client **Meridian Capital** is evaluating three term sheets for an active matter.
Your job is to reconstruct which option Meridian would prefer from **institutional
history in the notes** — not from a single numeric field.

## Goal

Identify Meridian Capital's **most preferred** term-sheet option for the active
Northline add-on matter, grounded in prior Meridian deal behavior.

## Steps

1. When ClawQL memory is available, use `clawql_memory_recall` to find Meridian
   Capital / client notes and related matters. The vault may expose client↔matter
   links that help you traverse prior deals without knowing every path up front.
2. Read Meridian's risk profile and prior matter outcomes (what they accepted or
   rejected historically).
3. Read the three term-sheet annexes for the active matter. Each annex states
   surface terms (price, indemnity, MAC, earn-out). None is labeled preferred.
4. Rank by Meridian's institutional preferences. Do **not** sort solely by
   headline purchase price — that is a distractor pattern used by other clients.
5. Write relative `preference.json` with your top-1 choice and brief cite-backed
   rationale. Chat JSON is not graded.

## Artifact

```json
{
  "client": "Meridian Capital",
  "active_matter": "MAT-XXXX",
  "top1": "MAT-XXXX-Y",
  "ranking": ["MAT-XXXX-Y", "...", "..."],
  "rationale": "short prose citing prior matters / risk notes",
  "source": "memory_recall"
}
```

Use `source`: `memory_recall` when you used vault tools; `filesystem` when you
only read seed files under `.openbench/memory-seed/`.

## Scoring

- Top-1 must match ground truth. Wrong top-1 → 0.
- Empty `source` → 0.
- When memory tools are available, live grading requires a real
  `clawql_memory_recall` tool_use.

## Rules

- Ignore `decoy/`. Do not invent option IDs.
- Stop only after writing relative `preference.json`.
