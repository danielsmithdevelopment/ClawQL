# CodeGraph prove keys (Track B) — **pending**

**Status:** not written yet — **this is the freeze critical path** (2026-10-15).  
**Harness:** [`agent-loop-freeze.md`](agent-loop-freeze.md)  
**Default if missing:** `codegraph_*` leaves the 8.0.0 bundle (purge inventory).

## Requirements

| Rule | Detail |
| ---- | ------ |
| Repo | Real multi-file tree (not toy / single-file fixtures) |
| Job | Callers-of, impact-of-change, or cross-file dependency/path |
| Grep control | Answer **not** recoverable by one unique-string `grep` |
| Gold | Human- or oracle-verified symbol/edge ids on the same tree |
| n | Enough for Net≥5 (or documented McNemar alternative) before spend |

## Rejected as prove material

- Tiny-repo “What file exports X?” (grep-soluble).
- Spent RFC deep-miss set ([`unsolved-8-key-review.md`](unsolved-8-key-review.md)).

## Keys

_None yet. Add rows here (id, repo, question, gold, why grep fails) before any OpenRouter Track B run._
