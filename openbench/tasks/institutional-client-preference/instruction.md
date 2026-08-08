# Institutional knowledge — client preference reconstruction (B-7.2)

CRITICAL (scores 0 if ignored):
1. Call `clawql_memory_recall` for Meridian Capital, then **read** the three
   term-sheet annexes. Copy `top1` from an annex line `Option identifier: …`
   — never invent IDs (no `MAT-12345-A`, no dates, no placeholders).
2. Meridian prefers **deal certainty / capped indemnity / no earn-out**, not
   highest headline price. Highest price is a trap used by other clients.
3. Write relative `preference.json` via the **write** tool. Include
   `"source":"memory_recall"` (non-empty). Chat JSON is not graded.

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
Client **Meridian Capital** is evaluating three term sheets for an active matter.
Reconstruct which option Meridian would prefer from **institutional history**.

## Goal

Identify Meridian Capital's **most preferred** term-sheet option for the active
Northline add-on matter, grounded in prior Meridian deal behavior.

## Steps

1. Use `clawql_memory_recall` to find Meridian Capital / CLT-0017 notes and
   related matters (client↔matter links may help).
2. Read Meridian's risk profile and prior outcomes (what they accepted/rejected).
3. Read **all three** term-sheet annexes for the active Northline matter. Each
   has surface terms (price, indemnity, MAC, earn-out) and an Option identifier.
   None is labeled preferred.
4. Rank by Meridian history: certainty and liability caps beat headline price.
5. Write relative `preference.json`.

## Artifact

```json
{
  "client": "Meridian Capital",
  "active_matter": "<id from Meridian active matter note>",
  "top1": "<Option identifier copied from winning annex>",
  "ranking": ["<best>", "<middle>", "<worst>"],
  "rationale": "cite prior Meridian matters (e.g. rejected earn-out / MAC haircut)",
  "source": "memory_recall"
}
```

## Scoring

- Top-1 must match ground truth. Invented or price-only rankings → 0.
- When memory tools are available, live grading requires real `memory_recall`.
- Prefer a non-empty `source`; empty source no longer zeros a correct top1.

## Rules

- Ignore `decoy/`. Do not invent option IDs.
- Stop only after writing relative `preference.json`.
