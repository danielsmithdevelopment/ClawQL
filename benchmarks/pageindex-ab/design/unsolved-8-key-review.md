# Review: 8 deep misses still unsolved after Track A

**Date:** 2026-09-29  
**Cohort:** `tag: T` from [`vectify-fair-decision.json`](vectify-fair-decision.json) (neither Vectify nor qrewrite recovered).  
**Purpose:** read keys **before** spending Track B — do not chase noise.

## Verdict

| Class | n | Action |
| ----- | - | ------ |
| **Defective** | 7 | Drop from freeze prove / do not spend agent budget |
| **Sound (hard)** | 1 | Optional grep+read smoke only; not a CodeGraph prove set |

**Do not schedule Track B on these 8.** Track B’s critical path is **CodeGraph vs grep** on real-repo, grep-insoluble questions (callers / impact / cross-file).

## Per-key

| id | Q pattern | Gold title (abbrev) | Defect |
| -- | --------- | ------------------- | ------ |
| `hc-rfc-05-q02` | first numbered section | TOC `1 Introduction … 2` | Gold is **TOC ghost**; body twin `sec-1-introduction` exists |
| `hc-rfc-01-q02` | first numbered section | TOC `1 Introduction … 3` | same |
| `hc-rfc-04-q02` | first numbered section | TOC `1 Introduction …3` | same |
| `hc-rfc-03-q02` | first numbered section | TOC `1 Introduction … 4` | same |
| `hc-rfc-03-q03` | ~60% depth heading | `5 Verify that the resulting JOSE Header…` | **Numbered procedure step**, not §5 heading |
| `hc-rfc-07-q03` | ~60% depth heading | `1 If the field value is "*"…` | **List item**; body depth ≈95% not 60%; many `1 If…` twins |
| `hc-rfc-01-q03` | ~60% depth heading | `5 Arrays` | Real heading, but body depth ≈**36%** — wrong gold for the question |
| `hc-rfc-08-q03` | ~60% depth heading | `4.7 Specifying HTTP Header Fields` | **Sound** — real §4.7 at ≈60% body depth; hard for lexical/rewrite (no depth cue in text) |

## Root cause (shared)

Hard-candidate section maps **ingest TOC lines and numbered list steps as “sections.”** Auto-builders then:

1. Pin “first numbered section” gold to the **TOC** duplicate (leader dots + page number) instead of the body `1 Introduction`.
2. Pin “~60% depth” gold by index over a polluted list → procedure/list noise, or a real heading at the wrong depth.

That is key hygiene / map hygiene — not evidence that every retriever fails on sound questions.

## Implications

- Fair-test “8 unsolved” is mostly **measurement noise** once TOC/list ghosts are filtered.
- Spending a frontier agent loop on these keys wastes budget and cannot clear CodeGraph’s prove bar.
- Next hygiene (cheap, offline): strip TOC titles (`…` / leader-dot + page) and reject list-step titles from section maps before regenerating `section_lookup` / `buried_detail` keys.

## Related

- Prior hygiene: [`freeze-log-key-hygiene.md`](freeze-log-key-hygiene.md) (MUST/SHALL + bogus years)
- Track B scope: [`agent-loop-freeze.md`](agent-loop-freeze.md)
- Displacement lesson (rewrite/RRF shared top-k): [`query-rewrite-arm.md`](query-rewrite-arm.md)
