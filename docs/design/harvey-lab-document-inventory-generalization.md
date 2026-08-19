# Harvey LAB — Document inventory generalization (Layer 2)

Status: **spec** (2026-08-19) — addresses 026–050 Capital Markets / Restructuring
failures (tasks 028, 035, 040) without rubric-driven schema whack-a-mole.

Related: [`harvey-lab-duckdb-retrieval.md`](harvey-lab-duckdb-retrieval.md),
[`harvey-lab-idp-matter-pipeline.md`](harvey-lab-idp-matter-pipeline.md),
`integrations/harvey-labs/harness/adapters/clawql_lab_matter_schema.py`.

## Problem

Tasks 001–025 are dominated by Banking & Finance credit facilities and Antitrust
HSR matters. The DuckDB `matters` table and `MATTER_FIELD_REGISTRY` encode those
practice areas well. Tasks 026–050 introduce Capital Markets and Restructuring
matters whose documents are **not** represented in the typed column set.

Observed failure (ClawQL arm):

| Task | Ask | Wrong answer | Root cause |
| ---- | --- | ------------ | ---------- |
| 028 | DIP financing matters (5 qualifying) | 1013-00001 Genome Dx (single) | Agent queried `matters`; only credit-facility rows are well-populated → wrong population |
| 035 | Capital Markets + 180-day lock-up (2 matters + proof docs) | 1008-00002 Lumos, 1032-00003 Halcyon | Same — credit-facility matters asserted as CM offerings |
| 040 | Most recent withdrawn offering | 1008-00002 Lumos | Same — well-indexed credit matter reused as false positive |

Baseline arm failed differently: no deliverable (`response.md` not found). Empty
output passes precision (nothing asserted) but fails substance.

**This is not a DuckDB bug.** It is incomplete corpus coverage: the agent can only
SQL-query what ingest indexed. Without Capital Markets rows or a document inventory,
structured retrieval returns the closest **indexed** credit-facility matter and the
model asserts it confidently.

## Design goal

Generalize without rubric cheating:

- **Do not** add task-specific booleans (`has_lock_up_agreement`, `is_dip_financing`)
  after reading failing criteria.
- **Do** inventory every file in every matter folder and make filenames + extracted
  terms queryable via SQL.
- **Keep** existing Layer 1 typed columns for domains already calibrated (credit
  facility, HSR) — performance on 001–025 must not regress.
- **Degrade gracefully** on unfamiliar practice areas: zero rows or document hits
  beats wrong rows from a different practice area.

This maps to the three-layer meta-ontology model:

| Layer | What | Harvey LAB today | After this spec |
| ----- | ---- | ---------------- | --------------- |
| L1 | Pre-built domain schemas | `matters` typed cols + views | Unchanged for B&F + HSR |
| L2 | Runtime document inventory | Vault markdown list only (not SQL) | `matter_documents` + `key_terms` JSON |
| L3 | Promotion from traces | Not implemented | Future: promote repeated `key_terms` patterns |

## Architecture

```
DMS matter folder (all files)
  → path detectors → matters core row (practice_area, matter_type, matter_status, …)
  → catalog ALL files → matter_documents (filename, doc_type, doc_date, key_terms JSON)
  → priority .docx subset → existing MATTER_FIELD_REGISTRY extract (Layer 1, unchanged)
  → open_facts (L0 phrase hits, unchanged)
  → matters.duckdb

Agent:
  1. Filter cohort by practice_area / matter_type (core columns)
  2. Join matter_documents for document-shaped asks (lock-up, withdrawal, DIP order)
  3. Query key_terms via DuckDB JSON operators when numeric/date terms needed
  4. Fall back to open_facts + read proof doc — never assert credit-facility matters
     when cohort query returns zero Capital Markets rows
```

## Fixed core (`matters` table additions)

Add practice-area-agnostic columns. Populate from existing detectors + folder
metadata — **not** from rubric inspection.

| Column | Type | Source | Notes |
| ------ | ---- | ------ | ----- |
| `matter_status` | VARCHAR | Path/filename heuristics + optional doc signals | `active`, `closed`, `withdrawn`, `pending`, NULL=unknown |
| `matter_date` | DATE | Best available canonical date | `deal_date` fallback; offering/filing dates from docs |
| `matter_amount_usd` | DOUBLE | Existing `deal_value_usd` / `facility_amount_usd` merge | Single “deal value” column for SQL ergonomics |
| `document_count` | INTEGER | `COUNT(*)` from inventory at ingest | Sanity check for agent |
| `indexed_doc_count` | INTEGER | Docs with non-empty `key_terms` or parsed text | Coverage signal |

**Rename mapping (non-breaking):** keep existing columns; add views that alias
`matter_amount_usd := COALESCE(facility_amount_usd, deal_value_usd)`.

Existing columns (`practice_area`, `matter_type`, `is_credit_facility`, HSR flags,
credit-facility semantic bools) stay as Layer 1 — do not remove.

## Document inventory (`matter_documents` table)

One row per file under `matters/<matter_id>/` (not just top `.docx` picks).

```sql
CREATE TABLE matter_documents (
  matter_id       VARCHAR NOT NULL,
  rel_path        VARCHAR NOT NULL,   -- path under matter folder
  filename        VARCHAR NOT NULL,
  ext             VARCHAR NOT NULL,   -- lower suffix without dot
  doc_type        VARCHAR,            -- inferred; NULL = unknown
  doc_date        DATE,               -- from filename or content; NULL = unknown
  file_size_bytes BIGINT,
  key_terms       JSON,               -- schema-free extracted terms
  text_snippet    VARCHAR,            -- first ~500 chars after Tika (optional cap)
  parse_status    VARCHAR,            -- ok | skipped | failed | too_large
  PRIMARY KEY (matter_id, rel_path)
);

CREATE INDEX idx_matter_documents_filename ON matter_documents(filename);
CREATE INDEX idx_matter_documents_doc_type ON matter_documents(doc_type);
```

### `doc_type` inference (filename-first, content-second)

Mechanical rules — same category as path detectors, not rubric fields:

| Signal (filename / path) | `doc_type` |
| ------------------------ | ---------- |
| `lock-up`, `lockup`, `lock_up` | `lock-up-agreement` |
| `withdraw`, `withdrawal`, `notice-of-withdrawal` | `withdrawal-notice` |
| `offering-memorandum`, `prospectus`, `424b`, `s-1`, `f-1` | `offering-document` |
| `dip`, `debtor-in-possession`, `debtor_in_possession` | `dip-financing` |
| `credit-agreement`, `loan-agreement`, `bridge`, `term-loan` | `credit-agreement` |
| `hsr`, `second-request`, `second_request` | `hsr-filing` |
| `form-of-`, `form_of_` | `form-document` |
| default | `other` |

`doc_type` is a **hint** for ranking and SQL filters, not a graded boolean.

### `key_terms` shape (schema-free)

Populated by lightweight extractors (regex + LangExtract demo optional) on a
**bounded** subset of docs per matter:

```json
{
  "lock_up_period": "180 days",
  "lock_up_period_days": 180,
  "offering_status": "withdrawn",
  "withdrawal_date": "2024-03-15",
  "dip_amount_usd": 25000000,
  "parties": ["Arbor Health Tech", "Goldman Sachs"],
  "source": "local_heuristic"
}
```

Rules:

- Keys are snake_case strings; values are string, number, boolean, or ISO date string.
- No fixed key registry required at ingest time.
- Agent queries with DuckDB JSON: `key_terms->>'lock_up_period_days'`.
- Layer 3 (future): if `lock_up_period_days` appears in ≥K matters with stable
  typing, promote to a typed L1 column **from production traces**, not benchmark rubrics.

### Ingest scope and caps

| Setting | Default | Purpose |
| ------- | ------- | ------- |
| `CLAWQL_LAB_DOC_INVENTORY_ALL_FILES` | `1` | Walk entire matter tree |
| `CLAWQL_LAB_DOC_INVENTORY_PARSE_LIMIT` | `20` | Max docs/matter for Tika + key_terms |
| `CLAWQL_LAB_DOC_INVENTORY_TEXT_CAP` | `500` | `text_snippet` char cap |
| `CLAWQL_LAB_DOC_INVENTORY_SKIP_EXT` | `.png,.jpg,.pdf,.xlsx,.zip` | Skip binaries in v1 |

**Every file gets a row** (filename inventory). **Parsing** is capped and ranked
by `doc_score()` + `doc_type` priority (same ranking as `catalog_matter_docs`,
extended to non-docx where cheap).

## Trust layer rules (document inventory)

Extend existing L0/L2 semantics:

| Situation | Agent behavior |
| --------- | -------------- |
| Cohort filter returns 0 rows | Write **0 of N** or “none found” — do **not** pick best credit-facility matter |
| `matter_documents` join returns 0 rows | Same — absence is evidence after covering practice_area filter |
| `key_terms` missing a key | NULL = unknown; do not infer from unrelated matters |
| Filename match without content parse | Cite filename as weak evidence; prefer parsed `key_terms` |
| Layer 1 bool NULL | Unchanged: NULL ≠ false (principle 10) |

New preflight warning (not error unless strict):

- `practice_area = 'Capital Markets'` matters with `document_count = 0` → warn
- Agent asserted matter outside SQL cohort → deliverable-level judge failure (unchanged)

## Agent query patterns

Add to `clawql_system_prompt.md` as **Pattern G — document inventory SQL**.

### G1 — Practice-area cohort (always first for CM / Restructuring asks)

```sql
-- How many Capital Markets matters do we have indexed?
SELECT practice_area, matter_type, count(*) AS n
FROM matters
GROUP BY 1, 2
ORDER BY n DESC;

SELECT matter_id, client_short_name, matter_status, matter_date
FROM matters
WHERE lower(practice_area) LIKE '%capital%market%'
ORDER BY matter_date DESC NULLS LAST, matter_id;
```

If this returns **zero rows**, stop and write a negative deliverable. Do not
query `WHERE is_credit_facility = true` as a substitute cohort.

### G2 — Document filename search (lock-up, withdrawal, DIP)

```sql
-- Matters with lock-up agreement documents (any practice area)
SELECT m.matter_id, m.client_short_name, m.practice_area,
       d.rel_path, d.doc_type, d.key_terms
FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE d.filename ILIKE '%lock-up%'
   OR d.filename ILIKE '%lockup%'
   OR d.doc_type = 'lock-up-agreement'
ORDER BY m.matter_id, d.rel_path;

-- Capital Markets + lock-up filename (task 035 shape)
SELECT m.matter_id, m.client_short_name, d.filename, d.key_terms
FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE lower(m.practice_area) LIKE '%capital%market%'
  AND (d.filename ILIKE '%lock-up%' OR d.doc_type = 'lock-up-agreement');
```

### G3 — key_terms JSON (180-day lock-up)

```sql
SELECT m.matter_id, m.client_short_name, d.filename,
       d.key_terms->>'lock_up_period_days' AS lock_days
FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE d.doc_type = 'lock-up-agreement'
  AND CAST(d.key_terms->>'lock_up_period_days' AS INTEGER) = 180;
```

When `lock_up_period_days` is absent everywhere, fall back to G2 filename hits +
`read` the proof doc — do not substitute credit-facility matters.

### G4 — Withdrawn offering (most recent)

```sql
SELECT m.matter_id, m.client_short_name, m.matter_status, m.matter_date,
       d.filename, d.key_terms->>'withdrawal_date' AS withdrawal_date
FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE m.matter_status = 'withdrawn'
   OR d.doc_type = 'withdrawal-notice'
   OR d.filename ILIKE '%withdraw%'
ORDER BY COALESCE(
  TRY_CAST(d.key_terms->>'withdrawal_date' AS DATE),
  m.matter_date
) DESC NULLS LAST
LIMIT 5;
```

### G5 — DIP financing (multi-matter enumeration)

```sql
SELECT DISTINCT m.matter_id, m.client_short_name, d.rel_path, d.doc_type
FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE d.doc_type = 'dip-financing'
   OR d.filename ILIKE '%dip%'
   OR d.rel_path ILIKE '%debtor-in-possession%'
ORDER BY m.matter_id;
```

Precision: list only matters returned by this query (+ read verification). Do not
collapse to a single “best” credit-facility matter.

### G6 — Combined: existing Layer 1 + inventory

Credit-facility tasks (001–025) keep current views:

```sql
SELECT * FROM credit_facilities WHERE mentions_springing_lien = true;
```

Unfamiliar asks use inventory first; Layer 1 bools second:

```sql
-- Wrong (028 failure mode)
SELECT matter_id FROM matters WHERE is_credit_facility ORDER BY deal_date DESC LIMIT 1;

-- Right
SELECT m.matter_id FROM matters m
JOIN matter_documents d ON m.matter_id = d.matter_id
WHERE d.doc_type = 'dip-financing';
```

## Implementation plan

### Phase 1 — Schema + inventory ingest (unblocks local validation)

Files to change:

| File | Change |
| ---- | ------ |
| `clawql_lab_matter_schema.py` | Add `infer_doc_type()`, `catalog_all_matter_files()`, `extract_key_terms_from_text()` |
| `clawql_lab_duckdb.py` | Create/populate `matter_documents`; add core columns; helper views |
| `clawql_lab_session.py` | Build document rows during `_ingest_firm_knowledge_dms`; pass to DuckDB |
| `clawql_lab_evidence.py` | Optional: extend `open_facts` with `doc_inventory.*` keys |
| `clawql_system_prompt.md` | Pattern G + “zero cohort → negative answer” rule |
| `clawql_agent_loop.py` | Nudge when prompt mentions lock-up / withdrawn / DIP / offering |

New tests:

- `test_document_inventory_catalog.py` — all files listed; doc_type inference
- `test_document_inventory_duckdb.py` — join queries; empty CM cohort
- `test_no_cross_practice_fallback.py` — agent prompt includes guardrail text

### Phase 2 — Practice area detectors (reduce NULL practice_area)

Extend path detectors in `clawql_lab_session.py` (same fairness class as
`detect_credit_facility`):

| Detector | Signals | Sets |
| -------- | ------- | ---- |
| `detect_capital_markets` | `Offering/`, `Capital Markets/`, prospectus/offering memo paths | `practice_area`, `matter_type` |
| `detect_restructuring` | `Restructuring/`, `DIP/`, `Bankruptcy/` | `practice_area`, `matter_type` |
| `detect_withdrawn_status` | withdrawal notice filename in inventory | `matter_status = 'withdrawn'` |

Mechanical only — no gold matter IDs.

### Phase 3 — key_terms extractors

| Doc type | Extractor | Example keys |
| -------- | --------- | ------------- |
| lock-up-agreement | regex + LangExtract optional | `lock_up_period_days`, `parties` |
| withdrawal-notice | date regex | `withdrawal_date`, `offering_status` |
| dip-financing | amount regex | `dip_amount_usd`, `dip_lender` |
| offering-document | status regex | `offering_type`, `offering_status` |

Reuse Tika path from existing IDP loop; share parse budget with
`catalog_matter_docs` ranking.

### Phase 4 — Re-run 026–050 sweep

After local validation on 028, 035, 040:

1. Confirm CM cohort non-empty OR agent writes honest negative
2. Confirm no Lumos/Genome false-positive pattern
3. Full 026–050 matrix rerun (both arms)
4. Compare CPR / all-pass vs first sweep

## Benchmark discipline

**Allowed before seeing task scores:**

- Inventory all files in all matter folders
- Filename-based `doc_type` inference
- Generic `key_terms` extraction from document text
- Practice-area path detectors from folder structure

**Not allowed:**

- Adding a column because task 035 criterion mentions “lock-up”
- Hard-coding gold matter IDs (1006-00002, 1020-00003, …)
- SQL views named after task numbers that embed gold sets

**Regression guard:** tasks 001–025 gold SQL asserts in
`idp_matter_pipeline.py` must stay green after Phase 1.

## Success criteria (028 / 035 / 040)

| Task | Pass condition |
| ---- | -------------- |
| 028 | Agent lists all five DIP matters from `matter_documents` join — or 0/N with empty dip cohort, not Genome Dx |
| 035 | Agent finds Arbor 1010-00002 + Solstice 1037-00001 via CM + lock-up doc join; cites `form-of-lock-up-agreement.docx` |
| 040 | Agent returns Greenfield 1020-00003 via withdrawal doc / status + date ordering — not Lumos |

Precision failures should drop: wrong-practice-area assertions become preventable
when cohort SQL returns empty.

## Non-goals (this spec)

- Replacing vault `memory_recall` with SQL
- Full-text search index across all doc bodies (defer to v0.2 FTS in duckdb-retrieval.md)
- Layer 3 auto-promotion implementation
- Baseline arm DuckDB (Harvey parity unchanged)

## Open questions

1. Parse PDF offering memos in v1 or docx-only? (Recommend: docx + txt first; PDF in Phase 3 if needed.)
2. Mirror `matter_documents` into `ontology.db` or DuckDB-only for LAB?
3. Should `matter_status` propagate to vault `CLAWQL_STATUS` block for recall filters?

## Suggested immediate next steps

1. Implement Phase 1 (inventory table + ingest) on a feature branch
2. Local dry-run: `idp_matter_pipeline.py` + manual `clawql_sql` queries for 028/035/040 shapes
3. Finish pending ClawQL cells 042, 044–050 on **current** schema (rate-limit rerun) — baseline comparison data
4. Re-run 026–050 after Phase 1–2 land
