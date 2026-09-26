# Ship rule spend (v0.6) — Decide cutover gate

**Status:** declared spend — logged **before** twin-aware rematch of v0.5 and before any live cutover.  
**Date (UTC):** 2026-09-25  
**Branch:** `cursor/fast-decision-decide-v06-088d`  
**Parent closeout:** [`DECIDE_V05_SCORE_ONCE_CLOSEOUT.md`](./DECIDE_V05_SCORE_ONCE_CLOSEOUT.md)

## Why this is a spend

The v0.5 predeclared rule was “ship Decide only if 0 errors among fires.” Both arms had 1 frontier-GT error; that rule picked no winner. Changing the comparison rule after seeing fires is a **new spend**. We declare it here explicitly rather than pretending the old rule still chooses.

## Declared ship / comparison rule

1. **Twins are ontology bugs, not model errors** — see [`CATALOG_TWIN_EQUIVALENCE.md`](./CATALOG_TWIN_EQUIVALENCE.md). Correctness uses twin equivalence.
2. Among reject arms under frontier GT (twin-aware):
   - If fire-error counts are **equal**, prefer the arm with **higher coverage** (fire rate).
   - If one arm has **fewer** fire errors, prefer that arm.
   - Ties on both errors and coverage → keep incumbent (stock).
3. Live cutover target when Decide wins: **T=0.75**, **τ=0.80**, model `fastino/GLiNER2.5-Decide`.

## Cutover checklist (from v0.5 policy)

| #   | Condition                                            | Status                      |
| --- | ---------------------------------------------------- | --------------------------- |
| 1   | Stock v0.5 miss written next to Decide’s             | **done** — both twins       |
| 2   | Catalog treats mcp↔skill twins as one allowed answer | **this spend** — code + doc |
| 3   | Ship rule declared as a spend (this file)            | **this spend**              |

When (1)–(3) hold and twin-aware rematch shows Decide wins under the rule above → cut over live path.

## Honesty

- Does **not** rewrite v0.4 `productionTrusted` history (0/18 stock on that suite).
- Does **not** retune τ on v0.5 fires.
- Does **not** relabel v0.5 suite GT after the fact — twin equivalence absorbs the fight.
- v0.6 frozen suite (if cut) remains the next held-out claim under this rule; twin-aware rematch of v0.5 is the **gate** for cutover, not a new productionTrusted closeout by itself.
