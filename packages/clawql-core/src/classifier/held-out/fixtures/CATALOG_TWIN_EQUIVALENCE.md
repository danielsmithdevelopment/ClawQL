# Catalog twin equivalence (mcp ↔ skill)

**Status:** locked for scoring correctness (v0.6 spend).  
**Code:** `packages/clawql-core/src/classifier/candidate-equivalence.ts`  
**Ship rule:** [`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)

## Why

v0.5 reject-arm “errors” (`route-v05-007`, `route-v05-023`) were mcp↔skill twin fights: the model matched suite GT; frontier preferred the skill wrapper. Those are **ontology / catalog alias** bugs, not wrong-capability routes (unlike `route-v04-004` execute→search).

## Rule

Declared twin pairs count as **one correct answer**. Exact id match still wins. Co-occurrence in a candidate set is **not** enough — only pairs listed below are twins.

## Declared pairs

| MCP tool | Skill twin |
| --- | --- |
| `mcp.search` | `skill.clawql-search-workflows` |
| `mcp.execute` | `skill.clawql-execute-workflows` |
| `mcp.memory_ingest` | `skill.clawql-memory-ingest` |
| `mcp.memory_recall` | `skill.clawql-memory-recall` |
| `mcp.notify` | `skill.clawql-notify-workflows` |
| `mcp.schedule` | `skill.clawql-schedule-workflows` |
| `mcp.sandbox_exec` | `skill.clawql-sandbox-exec` |
| `mcp.audit` | `skill.clawql-audit-workflows` |
| `mcp.cache` | `skill.clawql-cache-workflows` |
| `mcp.ingest_external_knowledge` | `skill.clawql-external-ingest` |
| `mcp.knowledge_search_onyx` | `skill.clawql-onyx-knowledge-workflows` |
| `mcp.ouroboros_run_evolutionary_loop` | `skill.clawql-ouroboros-workflows` |
| `mcp.clawql_think` | `skill.deep-thinking` |

## Explicitly not twins

- `skill.clawql-composed-mcp-workflows` (multi-tool)
- `skill.clawql-vault-memory` (broader than one tool)
- Anti-patterns (`mcp.memory_recall_overbroad`, …)
- Cross-capability distractors that merely share a candidate list

## Where applied

- Held-out scoring correctness (`run-held-out.ts`)
- §7 validation accuracy (`validation.ts`)
- Stock vs Decide report rematch (`compare-stock-vs-decide-v05.mts`)

Ontology generation still ships **one row per id** (no GLiNER label collapse). Equivalence is for **correctness attribution** only.
