# Freeze: fast-decision-held-out-v0.3-routing-fresh

## Status

**FROZEN** — do not edit cases without cutting a new suite id and new digest.

## Integrity process

1. Isolated drafter session ([Draft fresh routing cases](bc-c622daec-7440-5141-950b-6caf06ea173d), model `claude-sonnet-5-thinking-medium`) received **only** `routing-fresh-v0.3-source-catalog.json` semantics (via `/tmp/isolated-routing-drafter/catalog.json` + case schema). Banned: Harvey held-out, capability-ontology fixture, ontology enrichment eval log, classifier held-out tree.
2. Reviewer (this agent session) checked **correctness only**: schema, unique `groundTruthCandidateId` among candidates, coverage/sibling structure. **No query rewrites.** No `whenToUse` / hint text authored in this freeze.
3. Contaminated Harvey routing seven were **not** used as templates (token-overlap check against those queries: 0 high-overlap hits).

## Digests (SHA-256 of canonical JSON: sorted keys, compact separators, whitespace-normalized strings)

| Artifact                                                | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Suite `fast-decision-held-out-v0.3-routing-fresh.json`  | `02aa28eaf9f4d74f41e048c6735484cfab80a57c9c73f5a85402809d57a700aa` |
| Source catalog `routing-fresh-v0.3-source-catalog.json` | `45a3899ce0b3f6efb3621b47db46daf640843ed7282fc2a372ce425c0e266cbf` |

## Freeze metadata

- Frozen at (UTC): `2026-09-25T02:48:42Z`
- Freeze commit: `fe803af825c866f126f02efe595daf9047af203d`
- Case count: 34
- useSiteId: `search_provider_tool_routing` (all cases)
- adjudicated: false (all)
- Suite file: `fast-decision-held-out-v0.3-routing-fresh.json`

## Hint / ontology rule

Per `docs/specs/classifier/capability-ontology-from-catalog-v0.1.md` §5.1: any tool/skill `whenToUse` / `whenNotToUse` / `distinguishFrom` text, or generated ontology, used for a non-contaminated score on this set **must** post-date this freeze commit. Do not author hint text in the same change that freezes the set.

## Scoring discipline (do not break)
- **Do not run v0.3 until hints are written, then run both arms together** (ontology on + `CLAWQL_FAST_DECISION_ONTOLOGY=0`) in the same run against the same `ontologyDigest`. Running ontology-off early would leak which cases fail to the hint author.
- **Tool IDs in this suite are frozen.** Adding hints may change the ontology digest (expected). Renaming, merging, or splitting tool IDs invalidates cases — re-freeze affected cases; do not patch a mapping.
