# Institutional knowledge — amortized multi-question session (B-7.3)

You are an associate at a synthetic firm (mini **Calderwood & Harkness** fixture).
The same ~120 nested matter notes are available for every run. When ClawQL memory
is available, the vault may expose structured field tags and **persist across the
five related questions in this session**.

## Session goal

Answer five related questions about matters matching:

1. Escrow percentage **≥ 10**, and
2. Non-compete duration **longer than 18 months**

Question 1 builds the complete match set (and should be ingested into memory when
tools allow). Questions 2–5 reuse that representation under tighter budgets —
do **not** re-scan the entire corpus from scratch if vault recall is available.

## Artifacts

Write one JSON file per question under relative `session/`:

| Step | File | Content |
|------|------|---------|
| Q1 | `session/q1.json` | Full match set (`matters`) |
| Q2 | `session/q2.json` | Subset with escrow ≥ 15 |
| Q3 | `session/q3.json` | Count with NC > 24 |
| Q4 | `session/q4.json` | Client names for the match set |
| Q5 | `session/q5.json` | Matter id with longest NC |

The harness runs questions **sequentially** in one workspace. Later prompts arrive
as separate turns with their own spend caps.

## Scoring

- Mean of per-question scores (exact-set / exact-value graders).
- False positives on matter sets → 0 for that question.
- When memory tools are available, live grading requires real `memory_recall`
  evidence somewhere in the session (Q1 is the usual place).

## Rules

- Ignore `decoy/`. Do not invent matter IDs.
- Prefer structured `memory_recall` (`schema` + `filters`) over keyword search.
- Chat JSON is not graded — use the **write** tool for each `session/qN.json`.
