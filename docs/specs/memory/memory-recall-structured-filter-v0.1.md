---
title: "memory_recall Structured Filter Extension — Spec v0.1"
status: "Draft · August 2026"
package: "clawql-memory"
depends_on: "clawql-ontology (legal domain spec) · ontology.db"
---

# memory_recall Structured Filter Extension — Spec v0.1

**August 2026 · Draft**

Companion: [ClawQL Ontology Legal Domain Spec v0.1](../ontology/legal-domain-v0.1.md)

**Essay (value + OpenBench proof):** [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/) — semantic near-misses → grader hard-zero; `schema` + `filters` closed the set on B-7.1.

---

## 1. Problem

Current `memory_recall` routes all queries through semantic search (keyword + vector + wikilink graph). This is correct for most vault queries — "what did we decide about Cloudflare auth" is a semantic question.

Institutional knowledge enumeration tasks are not semantic questions. "All matters with escrowPct >= 10 AND nonCompeteMonths > 18" is a predicate evaluation over typed fields. Routing it through semantic search introduces:

- **False positives:** a matter with 9% escrow ranks highly because it is semantically similar to one with 12% escrow
- **Turn cost scaling with corpus size:** the agent must read N notes to verify field values, hitting turn limits at N > ~20
- **Non-determinism:** semantic similarity scores vary; the same query may return different results across runs

Structured filter extension routes predicate queries to the ontology index, bypassing semantic search entirely for these cases.

---

## 2. New Parameters

```typescript
interface MemoryRecallParams {
  // Existing — unchanged
  query: string;
  limit?: number; // default 10
  maxDepth?: number; // wikilink graph traversal depth
  sources?: MemorySource[]; // vault | vector | codegraph | pageindex | onyx

  // New — ontology filter extension
  schema?: OntologySchema; // "legal.Matter" | "legal.Client" | etc.
  filters?: OntologyFilter; // typed predicate filters
  confidenceMinimum?: ConfidenceLevel; // EXTRACTED | INFERRED | AMBIGUOUS
  includeConfidenceTags?: boolean; // include confidence in each result (default true)
  orderBy?: OrderByClause; // sort ontology results
}

type OntologySchema = "legal.Matter" | "legal.Client" | "legal.Attorney" | "legal.Document";

type FilterPredicate =
  | { eq: string | number | boolean }
  | { ne: string | number | boolean }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { in: (string | number)[] }
  | { nin: (string | number)[] }
  | { contains: string }
  | { startsWith: string }
  | { between: [number, number] }
  | { isNull: boolean }
  | { and: FilterPredicate[] }
  | { or: FilterPredicate[] };

type OntologyFilter = Record<string, FilterPredicate>;
type ConfidenceLevel = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
type OrderByClause = { field: string; direction: "asc" | "desc" }[];
```

---

## 3. Routing Logic

```typescript
async function memoryRecall(params: MemoryRecallParams): Promise<RecallResult> {
  if (params.schema && params.filters) {
    return await ontologyQuery(params); // structured predicate
  }
  if (params.schema && !params.filters) {
    return await hybridQuery(params); // schema-typed semantic (Phase 2)
  }
  return await semanticQuery(params); // existing path
}
```

**Three paths:**

1. **Structured predicate** (`schema` + `filters`): pure ontology index query, deterministic
2. **Schema-typed semantic** (`schema` only): Phase 2 — semantic search scoped to entity type
3. **Untyped semantic** (no `schema`): existing behavior, unchanged

Phase 1 implements path 1. Path 2 falls back to semantic with a `sourceNotes` hint until hybrid lands.

---

## 4. Ontology Query Implementation

Execute against `ontology.db` with camelCase → snake_case column mapping. Enrich hits with vault snippets. Return:

```typescript
{
  hits: RecallHit[],
  queryType: "structured_predicate",
  indexUsed: "ontology",
  schema, filters,
  scannedEntities, filteredEntities,
  confidenceMinimum
}
```

### 4.1 Confidence hierarchy

- `EXTRACTED` → only EXTRACTED
- `INFERRED` → EXTRACTED + INFERRED
- `AMBIGUOUS` → all

Fields with no confidence row are treated as EXTRACTED (machine-readable default).

---

## 5. B-7.1 response shape

Exact five ground-truth matters; near-miss (e.g. 9% escrow) never appears. Agent writes `matters.json` from `hits.map(h => h.entityId)`.

---

## 6. MCP Tool Specification Update

`memory_recall` exposes `schema`, `filters`, `confidenceMinimum`, `orderBy`. Description must steer agents toward structured mode for exact numeric enumeration.

---

## 7. Interaction with Existing Sources

When `schema` + `filters` are present, other `sources` are not queried — structured predicate evaluation is single-source by design (`indexUsed: "ontology"`).

---

## 8. Benchmarks: Before and After

| Mode                   | Turns (mini-firm) | At 250 matters |
| ---------------------- | ----------------- | -------------- |
| Semantic + read-verify | ~13               | ~50+           |
| Structured filter      | ~2                | ~2             |

OpenBench variant (follow-up): `institutional-knowledge-enumerate-ontology` with tight caps (5 turns / 60s / 4k tokens) requiring `schema: legal.Matter`.

---

## 9. Testing

Unit tests seed `ontology.db` (or vault `CLAWQL_*` + lazy sync) and assert:

- filteredEntities === 5
- IDs match MAT-2388/2401/2415/2450/2462
- 9% escrow near-miss excluded
- semantic path unchanged when filters omitted

---

## 10. Effect-TS Implementation Notes

Ontology query integrates into `executeMemoryRecallCoreEffect` behind the `schema + filters` branch — same Layer composition, new code path. Disable with `CLAWQL_ONTOLOGY_DB=0`.

---

_memory_recall Structured Filter Extension · Spec v0.1 · August 2026 · Draft_
_Companion: ClawQL Ontology Legal Domain Spec v0.1_
_Tracked in: clawql-memory package, ontology.db schema migration_
