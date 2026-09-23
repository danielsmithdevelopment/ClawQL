---
title: "The Fast Decision Primitive — Full Consolidated Specification"
status: "September 2026 — leg 5 of the 8.0.0 release, full build, no deferral"
version: "0.4 (supersedes v0.3, restructures around a general primitive rather than a lettered type list)"
package: "packages/clawql-core/classifier/ + packages/clawql-ontology/ + packages/clawql-harness/plugins/ouroboros/ + clawql-audit + DAOS coordination layer"
---

# The Fast Decision Primitive

## Full Consolidated Specification v0.4

**September 2026**

> Implementation lives at [`packages/clawql-core/src/classifier/`](../../../packages/clawql-core/src/classifier/). Export: `clawql-core/classifier`.

This document is the in-repo home for the Fast Decision Primitive v0.4. It supersedes lettered Types A–H with **one general classifier primitive** and an **open use-site registry**.

## Package boundary (§11)

| Concern                                   | Location                                                          |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Primitive (registry, contract, execution) | `packages/clawql-core/src/classifier/` (`clawql-core/classifier`) |
| `search` / `execute`, skill index         | `clawql-core` plugin architecture (unchanged)                     |
| WikiSkill / Ouroboros                     | `clawql-harness` Ouroboros plugin + `clawql-ouroboros`            |
| Ontology Layers 0–3 + vocabulary match    | `clawql-ontology`                                                 |
| `preferredVocabulary`                     | optional field on `ProviderPlugin`                                |
| DAOS NSV/SGDOP prefilter                  | classifier `sgdop_peer_prefilter` + DAOS specs                    |
| `pre-compaction` lifecycle event          | `LifecycleEvent` in `clawql-core`                                 |
| Stable append-only cache block            | classifier `StableCacheBlockService`                              |
| Threshold policy                          | classifier `FastDecisionThresholdPolicyService`                   |
| WORM entries                              | `clawql-audit` + core `WormAuditEvent`                            |

## Core contract (§3.1)

Effect-primary API (Promise façades only at host boundaries):

- `FastDecisionCandidate`, `FastDecisionUseSite`, `FastDecisionResult`, `FastDecisionContext`
- `runFastDecision(useSiteId, ctx)` — scores fixed candidate set, applies per-use-site threshold, writes WORM
- Open registry: `FastDecisionRegistry.register` — new use sites do not change the primitive interface

## Built-in use sites (§3.3)

`search_provider_tool_routing`, `skill_fast_path_match`, `ontology_vocabulary_term_match`, `document_entity_type_classification`, `field_to_schema_mapping`, `pattern_consistency_check`, `relationship_edge_classification`, `sgdop_peer_prefilter`, `pre_compaction_ontology_cache_check`

## Implementation notes

- **Open weights only** — **GLiNER2 / GLiNER2.5** is the primary production scorer (Apache 2.0; NAACL 2024 / EMNLP 2025 lineage; CPU-first classification + extraction). No TypeSafe Jev. Needle 3 remains an optional secondary Layer for edge/tiny deployments; Laya is not the default (independent zero-shot benches lag Jev).
- **Scorers** — `GlinerFastDecisionScorerLive` (primary; HTTP sidecar via `CLAWQL_FAST_DECISION_GLINER_URL`, else honest `gliner2-stub`), `HeuristicFastDecisionScorerLive` (tests), `NeedleFastDecisionScorerLive` (optional stub).
- **Skill fast path (§4)** — live `SkillValidityStore` check every invocation; stale/rolled_back never executes deterministically.
- **Streams (§5)** — `streams_event_dispatch` threshold policy with `hardFallbackRequired: true`.
- **Pre-compaction (§6)** — blocking `pre-compaction` hook; ontology/cache/audit-enriched features; append-only stable cache block never pruned.
- **SGDOP prefilter (§8)** — bloom-filter FN-biased inclusion; never final recruitment; coarse bucket approximation only.
- **Primary gate (§7)** — `FastDecisionValidationService` / `evaluateCorrectnessAndCalibration` before any cost/latency claims.
- **Thresholds (§9)** — per use site via `costlyErrorDirection`; never a global threshold.

## WORM types (§10)

`FAST_DECISION_ATTEMPTED`, `FAST_DECISION_ABOVE_THRESHOLD`, `FAST_DECISION_BELOW_THRESHOLD_FALLBACK`, `SKILL_FAST_PATH_EXECUTED`, `SKILL_FAST_PATH_REJECTED_STALE_SKILL`, `ONTOLOGY_STANDARD_TERM_USED`, `ONTOLOGY_NOVEL_FIELD_FALLBACK`, `SGDOP_PREFILTER_APPLIED`, `SGDOP_CANDIDATE_INCLUDED`, `PRE_COMPACTION_CACHE_CHECK_RUN`, `PRE_COMPACTION_CACHE_ITEM_WRITTEN`

## Deliberate non-claims (§12)

See full non-claims in the product specification: no Jev reliance; Section 7 validation not yet run on production task shapes; SGDOP prefilter is not exact geometry; legal-domain vocabulary unresolved; GLiNER sidecar must be deployed for live `gliner2` (without URL the stack is an honest stub); reasoning opacity on closed frontier APIs is a permanent structural limit.

## Related

- Plugin lifecycle: [`docs/design/clawql-core-plugin-architecture.md`](../../design/clawql-core-plugin-architecture.md)
- DAOS coordination: [`docs/ouroboros/daos-coordination-layer-specification.md`](../../ouroboros/daos-coordination-layer-specification.md)
- Ontology meta: [`docs/specs/ontology/meta-ontology-v0.1.md`](../ontology/meta-ontology-v0.1.md)

_The Fast Decision Primitive · v0.4 · September 2026 · Location: packages/clawql-core/classifier/_
