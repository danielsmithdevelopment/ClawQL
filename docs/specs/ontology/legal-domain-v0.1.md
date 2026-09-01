---
title: "ClawQL Ontology — Legal Domain Spec v0.1"
status: "Draft · August 2026"
package: "clawql-ontology/packs/legal/"
depends_on: "clawql-ontology (ADR 0009/0010) · clawql-memory · memory_recall structured filter extension"
---

# ClawQL Ontology — Legal Domain Spec v0.1

**August 2026 · Draft**

Companion to: ClawQL Streams Spec v0.2, B-7 Suite Spec, [memory_recall Structured Filter Extension Spec](../memory/memory-recall-structured-filter-v0.1.md)

**Essay (value + OpenBench proof):** [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/) — why typed predicates beat semantic vault recall for firm-knowledge enumeration.

**Roadmap (negative path + history):** `FailedStrategy` records, append-only field versions for evidentiary fields, and per-type coverage lint — [`security-ontology-knowledge-loop.md`](../../security/security-ontology-knowledge-loop.md) §3.

## Repo alignment

| Draft path                       | Shipped path                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `clawql-ontology/domains/legal/` | [`packages/clawql-ontology/packs/legal/`](../../../packages/clawql-ontology/packs/legal/) |
| `*.cqe` entity files             | `packs/legal/entities/*.cqe` (ADR 0010)                                                   |
| `ontology.db`                    | Colocated with `memory.db` under `CLAWQL_OBSIDIAN_VAULT_PATH` (`packages/clawql-memory`)  |

API field names remain camelCase (`escrowPct`); CQE/SQL use snake_case (`escrow_pct`).

---

## 1. Purpose

This document specifies the legal domain ontology for clawql-ontology — the typed entity schema that enables structured predicate evaluation over vault notes in legal workloads, specifically targeting the Calderwood & Harkness B-7 benchmark suite.

The ontology solves three problems the mini-firm fixture exposes:

**Field name ambiguity.** Raw vault notes may store escrow as `CLAWQL_ESCROW_PCT`, `escrow_percent`, `Escrow %`, or `escrow`. The ontology normalizes all of these to `escrowPct: Percentage` at ingestion time so queries are field-name-agnostic.

**Semantic near-miss false positives.** Semantic search on "escrow ≥ 10" may return a matter with 9% escrow because it is semantically similar to one with 12%. A typed predicate filter `escrowPct >= 10` is exact — 9% never appears.

**Scale degradation.** Agents reading 250 matter notes exhaustively hit turn limits. Ontology-typed queries run as predicate evaluation over the ontology index — O(1) regardless of corpus size.

---

## 2. Entity Definitions

### 2.1 Matter

The core entity in legal deal workflows.

```typescript
// packs/legal/entities/Matter.cqe (logical TypeScript view)

entity Matter {
  // Identity
  id: MatterID                          // MAT-XXXX format, required, unique
  title: string                         // human-readable matter name
  status: MatterStatus                  // Active | Closed | Pending | OnHold

  // Classification
  practiceArea: PracticeArea            // M&A | IP | Litigation | RealEstate |
                                        // Employment | Corporate | Tax | Other
  matterType: MatterType                // Acquisition | Merger | Divestiture |
                                        // JointVenture | AssetSale | StockSale |
                                        // IPLicense | Dispute | Advisory | Other
  jurisdiction: string?                 // optional — state/country

  // Deal economics (B-7.1 filter fields)
  dealValueUSD: Integer?                // deal value in whole dollars
  escrowPct: Percentage?                // 0.0–100.0, two decimal places
  escrowDurationMonths: Integer?        // length of escrow holdback
  nonCompeteMonths: Integer?            // duration of non-compete clause
  nonCompeteGeography: string?          // geographic scope of non-compete

  // Parties
  client: ClientRef                     // → Client entity, required
  counterparty: string?                 // name of opposing party
  supervisionPartner: AttorneyRef?      // → Attorney entity
  billingPartner: AttorneyRef?          // → Attorney entity
  leadAssociate: AttorneyRef?           // → Attorney entity

  // Timeline
  openedDate: ISODate?
  closedDate: ISODate?
  expectedCloseDate: ISODate?

  // Billing
  billingType: BillingType?             // Hourly | Contingency | Flat | Retainer
  totalBilledUSD: Integer?
  totalHours: Float?

  // Vault metadata (populated by memory_ingest)
  vaultNoteTitle: string                // stable vault note title for wikilinks
  vaultNotePath: string                 // path under CLAWQL_OBSIDIAN_VAULT_PATH
  lastIngestedAt: ISODateTime
  ingestVersion: string                 // clawql-ontology schema version

  // Relationships
  relationships {
    relatedMatters: MatterRef[]         // cross-matter wikilinks [[MAT-XXXX]]
    workProduct: DocumentRef[]          // → Document entities
    priorMatters: MatterRef[]           // historical matters for same client
  }
}

// Scalar types
type MatterID = string                  // /^MAT-\d{4}$/
type Percentage = number                // 0.0–100.0
type ISODate = string                   // YYYY-MM-DD
type ISODateTime = string               // ISO 8601

// Enum types
enum MatterStatus { Active Closed Pending OnHold }
enum PracticeArea { MA IP Litigation RealEstate Employment Corporate Tax Other }
enum MatterType {
  Acquisition Merger Divestiture JointVenture AssetSale StockSale
  IPLicense Dispute Advisory Other
}
enum BillingType { Hourly Contingency Flat Retainer }
```

### 2.2 Client

```typescript
entity Client {
  id: ClientID                          // CLT-XXXX format
  name: string                          // legal entity name
  shortName: string?                    // common name / alias
  industry: string?
  jurisdiction: string?
  tier: ClientTier?                     // Platinum | Gold | Silver | Standard

  relationships {
    matters: MatterRef[]                // all matters for this client
    contacts: ContactRef[]              // client-side contacts
    primaryPartner: AttorneyRef?        // relationship partner
  }
}

type ClientID = string                  // /^CLT-\d{4}$/
enum ClientTier { Platinum Gold Silver Standard }
```

### 2.3 Attorney

```typescript
entity Attorney {
  id: AttorneyID                        // ATY-XXXX format
  name: string
  title: AttorneyTitle                  // Partner | SeniorAssociate | Associate | Counsel
  practiceAreas: PracticeArea[]
  barAdmissions: string[]               // state bar admissions
  email: string?

  relationships {
    supervisedMatters: MatterRef[]
    billedMatters: MatterRef[]
  }
}

type AttorneyID = string                // /^ATY-\d{4}$/
enum AttorneyTitle { Partner SeniorAssociate Associate Counsel }
```

### 2.4 Document

```typescript
entity Document {
  id: DocumentID                        // DOC-XXXX format
  title: string
  documentType: DocumentType            // Agreement | Memo | Brief | Filing |
                                        // DueDiligence | Correspondence | Other
  matter: MatterRef
  author: AttorneyRef?
  draftVersion: string?                 // v1, v2, final, etc.
  status: DocumentStatus                // Draft | UnderReview | Executed | Filed
  createdDate: ISODate?
  executedDate: ISODate?
  vaultNotePath: string?

  relationships {
    relatedDocuments: DocumentRef[]
    supersedes: DocumentRef?
  }
}

type DocumentID = string                // /^DOC-\d{4}$/
enum DocumentType {
  Agreement Memo Brief Filing DueDiligence Correspondence Other
}
enum DocumentStatus { Draft UnderReview Executed Filed }
```

---

## 3. Field Extraction Rules

When `memory_ingest` processes a legal domain note, the ontology ingestion pass extracts fields using these rules in priority order:

### 3.1 Machine-readable field block (highest priority)

The mini-firm fixture and C&H corpus use explicit field blocks:

```
CLAWQL_MATTER_ID=MAT-2401
CLAWQL_ESCROW_PCT=12
CLAWQL_NONCOMPETE_MONTHS=24
```

Parser rules:

| Raw field name                                                    | Ontology field                | Type               | Normalization                       |
| ----------------------------------------------------------------- | ----------------------------- | ------------------ | ----------------------------------- |
| `CLAWQL_MATTER_ID`                                                | `Matter.id`                   | MatterID           | Validate /^MAT-\d{4}$/              |
| `CLAWQL_ESCROW_PCT`                                               | `Matter.escrowPct`            | Percentage         | Parse float, validate 0-100         |
| `CLAWQL_NONCOMPETE_MONTHS`                                        | `Matter.nonCompeteMonths`     | Integer            | Parse int                           |
| `CLAWQL_DEAL_VALUE_USD`                                           | `Matter.dealValueUSD`         | Integer            | Parse int                           |
| `CLAWQL_CLIENT_ID`                                                | `Matter.client`               | ClientRef          | Validate /^CLT-\d{4}$/              |
| `CLAWQL_PRACTICE_AREA`                                            | `Matter.practiceArea`         | PracticeArea       | Enum match                          |
| `CLAWQL_STATUS`                                                   | `Matter.status`               | MatterStatus       | Enum match                          |
| `CLAWQL_ESCROW_DURATION_MONTHS`                                   | `Matter.escrowDurationMonths` | Integer            | Parse int                           |
| `CLAWQL_NC_GEOGRAPHY`                                             | `Matter.nonCompeteGeography`  | string             | Trim                                |
| `CLAWQL_CLIENT_ID` + `CLAWQL_CLIENT_NAME` (no `CLAWQL_MATTER_ID`) | `Client` entity               | ClientID + name    | Client profile notes (`CLT-xxxx`)   |
| `CLAWQL_ATTORNEY_ID` + `CLAWQL_ATTORNEY_NAME`                     | `Attorney` entity             | AttorneyID + name  | Attorney profile notes (`ATY-xxxx`) |
| `CLAWQL_DOCUMENT_ID` + `CLAWQL_DOCUMENT_TITLE`                    | `Document` entity             | DocumentID + title | May include `CLAWQL_MATTER_ID` link |

### 3.2 Structured heading extraction (second priority)

For notes without explicit field blocks, extract from Markdown structure:

```markdown
## Deal Terms

- Escrow: 12% (24 months)
- Non-compete: 24 months, nationwide
- Deal value: $45M
```

Pattern matching rules — these are intentionally simple and conservative:

```
escrowPct:           /escrow[:\s]+(\d+(?:\.\d+)?)\s*%/i
nonCompeteMonths:    /non-?compete[:\s]+(\d+)\s*months?/i
dealValueUSD:        /deal\s+value[:\s]+\$?([\d,]+(?:\.\d+)?)\s*[MKB]?/i
```

When pattern matching is used (not machine-readable fields), set a confidence tag on the extracted field: `EXTRACTED` (machine-readable) vs `INFERRED` (pattern match) vs `AMBIGUOUS` (multiple conflicting extractions). The confidence tag is included in query results so agents can reason about extraction quality.

### 3.3 LLM extraction fallback (third priority, opt-in)

For unstructured notes where rules fail, optionally call clawql-inference to extract fields:

```typescript
// Only when CLAWQL_ONTOLOGY_LLM_EXTRACTION=1
// Uses Frugal tier — cheap, fast, structured output
const extracted = await inferenceClient.extract({
  schema: "legal.Matter",
  text: noteContent,
  fieldsToExtract: ["escrowPct", "nonCompeteMonths", "dealValueUSD"],
  confidenceThreshold: 0.8,
});
// All LLM-extracted fields tagged INFERRED
```

LLM extraction is opt-in because it adds latency and cost to every `memory_ingest` call. For the B-7 benchmark, machine-readable fields are sufficient and LLM extraction is off.

---

## 4. Ontology Index

The ontology index is a SQLite database (`ontology.db`) stored alongside `memory.db` in `CLAWQL_OBSIDIAN_VAULT_PATH`.

### 4.1 Schema

```sql
-- Entity tables
CREATE TABLE matters (
  id TEXT PRIMARY KEY,                  -- MAT-XXXX
  title TEXT,
  status TEXT,
  practice_area TEXT,
  matter_type TEXT,
  deal_value_usd INTEGER,
  escrow_pct REAL,
  escrow_duration_months INTEGER,
  non_compete_months INTEGER,
  non_compete_geography TEXT,
  client_id TEXT,
  supervision_partner_id TEXT,
  opened_date TEXT,
  closed_date TEXT,
  vault_note_path TEXT NOT NULL,
  last_ingested_at TEXT NOT NULL,
  ingest_version TEXT NOT NULL
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,                  -- CLT-XXXX
  name TEXT NOT NULL,
  short_name TEXT,
  industry TEXT,
  tier TEXT,
  vault_note_path TEXT
);

CREATE TABLE attorneys (
  id TEXT PRIMARY KEY,                  -- ATY-XXXX
  name TEXT NOT NULL,
  title TEXT,
  vault_note_path TEXT
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,                  -- DOC-XXXX
  title TEXT NOT NULL,
  document_type TEXT,
  matter_id TEXT REFERENCES matters(id),
  status TEXT,
  vault_note_path TEXT
);

-- Relationship tables
CREATE TABLE matter_related_matters (
  matter_id TEXT REFERENCES matters(id),
  related_matter_id TEXT REFERENCES matters(id),
  PRIMARY KEY (matter_id, related_matter_id)
);

-- Field confidence tags
CREATE TABLE field_confidence (
  entity_type TEXT NOT NULL,            -- Matter | Client | Attorney | Document
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  confidence TEXT NOT NULL,             -- EXTRACTED | INFERRED | AMBIGUOUS
  extraction_method TEXT NOT NULL,      -- machine_readable | pattern | llm
  PRIMARY KEY (entity_type, entity_id, field_name)
);

-- Indexes for common B-7 query patterns
CREATE INDEX idx_matters_escrow ON matters(escrow_pct);
CREATE INDEX idx_matters_nc_months ON matters(non_compete_months);
CREATE INDEX idx_matters_client ON matters(client_id);
CREATE INDEX idx_matters_practice ON matters(practice_area);
CREATE INDEX idx_matters_status ON matters(status);
```

### 4.2 Population

`memory_ingest` populates the ontology index alongside the existing vault write. Structured `memory_recall` also lazy-syncs `CLAWQL_*` blocks from vault Markdown when the index is empty (OpenBench seed paths that write files without ingest).

---

## 5. Integration with memory_recall

See companion [memory-recall-structured-filter-v0.1.md](../memory/memory-recall-structured-filter-v0.1.md).

### 5.1 B-7.1 query shape

```typescript
memory_recall({
  query: "matters with escrow and non-compete clauses",
  schema: "legal.Matter",
  filters: {
    escrowPct: { gte: 10 },
    nonCompeteMonths: { gt: 18 },
  },
  confidenceMinimum: "EXTRACTED",
  limit: 20,
});
```

### 5.2 Retrieval routing (when to use which path)

Not every legal task needs the same retrieval surface. Pick by **question shape**, not by benchmark name.

| Task shape                                   | Example                                                           | Path                                                                                | Why                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Exact set membership / numeric predicates    | B-7.1 escrow + non-compete; Harvey HSR second-request enumeration | `memory_recall` + `schema` + `filters` → `ontology.db` (`structured_predicate`)     | Typed SQL is exact; semantic recall introduces near-misses                                                      |
| Identity lookup (client, attorney, document) | `legal.Client` by `id` or `name`; documents for a matter          | Same Layer 1 ontology path                                                          | Small cardinality; vault `CLAWQL_*` → lazy sync is enough — no separate DuckDB table                            |
| Cohort frequency / market practice           | Harvey task 018 springing-lien share across credit facilities     | Pre-ingest `matters.duckdb` + `clawql_sql` / `data_query`                           | Rich boolean columns (`is_credit_facility`, covenant flags) come from DMS extract; SQL defines **N** then **k** |
| Prose / preference reconstruction            | B-7.2 Meridian term-sheet ranking                                 | Semantic `memory_recall` first; optional `legal.Client` filter to anchor `CLT-0017` | Ranking needs narrative history, not a WHERE clause — structured client recall is a bootstrap, not the verdict  |

**Harvey LAB Pattern E** (PR #915) is the Matter enumeration row: seed `HSR_SECOND_REQUEST` / `CREDIT_FACILITY` title tokens in vault, filter with `schema: "legal.Matter"`. **Pattern F** is the frequency row: DuckDB cohort SQL, with ontology recall as fallback for **N**.

Do **not** duplicate Harvey's DuckDB pre-ingest for Client/Attorney/Document — those entities lack DMS-wide extracted columns and do not need cohort denominators.

---

## 6. Ontology Linter

`clawql ontology lint` validates vault notes against the schema (entity `.cqe` lint already shipped). Instance-level lint against `ontology.db` (missing escrow, AMBIGUOUS conflicts) is Phase 1 follow-up (`clawql ontology lint --domain legal --vault …`).

---

## 7. B-7 Benchmark Impact

### B-7.1 (institutional-knowledge-enumerate)

**Without ontology:** agent calls `memory_recall` with a keyword query, gets semantic hits that may include near-misses, must read each note to verify field values, may hit turn limit before reading all matters.

**With ontology:** agent calls `memory_recall` with structured filters, gets exactly the matching matters in one call, returns complete `matters.json`. Turn count: 1 tool call + 1 write. Scales identically to 250 matters.

### B-7.2 (institutional-client-preference)

Primary retrieval is **semantic** (Meridian risk profile, prior matter prose). OpenBench seeds `CLAWQL_CLIENT_ID` / `CLAWQL_CLIENT_NAME` on client notes so agents _may_ anchor with:

```typescript
memory_recall({
  query: "Meridian Capital client profile",
  schema: "legal.Client",
  filters: { id: { eq: "CLT-0017" } },
  limit: 5,
});
```

Ranking still requires reading term-sheet annexes and prior matters — structured client recall does not replace that step.

### B-7.3–B-7.4

Amortized multi-question sessions and full C&H mount follow the suite plan in [`docs/benchmarks/openbench-b7-calderwood.md`](../../benchmarks/openbench-b7-calderwood.md).

---

## 8. Implementation Sequence

**Phase 1 (shipped):**

- Legal domain schema file (`Matter.cqe` + Client/Attorney/Document)
- Machine-readable field parser for CLAWQL_* blocks
- `ontology.db` SQLite schema and population via `memory_ingest` (+ lazy vault sync)
- Structured filter in `memory_recall` (`schema` + `filters` parameters) for all Layer 1 legal schemas
- B-7.1 rerun with ontology-typed query to validate 1-call enumeration

**Phase 2 (before B-7.4):**

- Pattern matching extraction for unstructured notes
- Relationship graph population
- `clawql ontology generate` for missing field stubs
- Full C&H ingestion with lint report

**Phase 3 (after B-7.4):**

- LLM extraction fallback (opt-in)
- Cross-domain ontology
- Ontology-guided fine-tuning (GRPO / RTP structured_predicate traces)

---

## 9. Connection to clawql-streams and Training Pipeline

When ClawQL Streams processes C&H tasks as events, each Agent DO session has access to the ontology index via embedded clawql-core. The RTP Retrieval node records `queryType: structured_predicate` with schema/filters so fine-tuning prefers exact numeric filters over semantic search for enumeration tasks.

---

_ClawQL Ontology — Legal Domain Spec v0.1 · August 2026 · Draft_
_Companion: memory_recall Structured Filter Extension Spec_
_Related: B-7 Suite Spec, clawql-streams Spec v0.2, clawql-inference Training Pipeline Spec_
