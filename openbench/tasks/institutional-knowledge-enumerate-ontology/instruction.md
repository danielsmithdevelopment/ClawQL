# Institutional knowledge — ontology structured filter (B-7.1-ontology)

Same mini **Calderwood & Harkness** fixture as `institutional-knowledge-enumerate`,
with a **tight spend cap**. This cell proves the ontology claim: exact field
enumeration completes in ~2 turns via structured filters (not keyword search).

## Goal

List **every** matter with escrow **≥ 10** AND non-compete **> 18 months**.

## Required tool call

Call `clawql_memory_recall` **once** with structured filters (do not keyword-search):

```json
{
  "query": "matters matching escrow and non-compete criteria",
  "schema": "legal.Matter",
  "filters": {
    "escrowPct": { "gte": 10 },
    "nonCompeteMonths": { "gt": 18 }
  },
  "confidenceMinimum": "EXTRACTED",
  "limit": 20
}
```

Expect `queryType: "structured_predicate"`. Copy every `entityId` into `matters.json`.

## Artifact

```json
{
  "matters": ["MAT-XXXX", "MAT-YYYY"],
  "criteria": {
    "escrow_pct_min": 10,
    "noncompete_months_gt": 18
  },
  "source": "memory_recall",
  "search_sufficiency": "structured_predicate legal.Matter"
}
```

## Scoring

- Exact set; false positives → 0.
- Live grading requires real `clawql_memory_recall` with `schema` + `filters`.
- Hard caps: **5 turns / 60s / 4000 tokens** (efficiency claim).

## Rules

- Ignore `decoy/`. Do not invent IDs.
- Stop after writing relative `matters.json`.
