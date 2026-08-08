# B-7.2 Ground Truth — Client CLT-0017 Preference Ranking

> **Not in the vault.** Agents must not read this file during the task.

Task: CLT-0017 (Meridian Capital) is evaluating three term sheets for MAT-2801.
Rank from most to least preferred given institutional context.

Ground truth ranking: `['MAT-2801-A', 'MAT-2801-C', 'MAT-2801-B']`

Rationale:

- **A (MAT-2801-A):** lowest indemnity cap, clean R&W, no earn-out, MAC deleted → fits Meridian risk profile (Apex haircut for certainty; walk before open-ended indemnity).
- **C (MAT-2801-C):** higher price but standard MAC, no earn-out → acceptable middle path.
- **B (MAT-2801-B):** highest price, earn-out + open MAC → Meridian rejected this pattern in MAT-2312 / MAT-2720.

Top-1 answer for grader: `MAT-2801-A`

Anti-pattern checks:

1. Field sort by purchase price would rank B > C > A — **not** the ground truth.
2. Corpus support: client.md + MAT-2244 / MAT-2312 / MAT-2720 prose cite the signal.
3. Answer option IDs appear only in term-sheet annex prose and this docs file — not in the task prompt.
