# Harvey LAB retrieval: DuckDB / SQL-first (maps to `clawql-data`)

Status: **LAB spike shipped** (2026-08-15) — `clawql_lab_duckdb.py` +
`clawql_sql` tool + Pattern F SQL-first nudges. `clawql-data` remains 📋 Planned
in the vision roadmap; this is the thin adapter path before that package.

Related: [[Harvey LAB ontology Pattern E]], task-018 probe arc (Fix 5–8),
`docs/vision/clawql-vision-roadmap.md` (`clawql-data`).

## Problem

Enumeration / frequency tasks (018 springing-lien, escrow filters, etc.) currently
force the agent through ClawQL-specific MCP surfaces:

- `memory_recall` + `schema` + nested `filters` JSON
- Pattern E/F prompt rules, limit≤50, matterIds packaging
- Cognitive load on top of the actual legal question

Humans (and strong coding models) already know **SQL**. The failure modes we keep
seeing (wrong N, empty cohort, 40-turn bash) are often **tool-interface**
failures, not inability to count.

## Three strategies (not two)

| ID    | Name                     | Agent tools                                                    | Who builds structure?                                       |
| ----- | ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------- |
| **A** | Baseline (Harvey-parity) | bash / grep / read over DMS                                    | Nobody — raw files                                          |
| **B** | SQL-only                 | DuckDB SQL over preloaded tables                               | Shared preprocess (or ClawQL extract exported to both arms) |
| **C** | ClawQL full stack        | DuckDB SQL **+** vault memory **+** ontology **+** hybrid/Onyx | ClawQL ingest/extract pipeline                              |

**Recommendation for firm-knowledge ledger**

- Keep **A** as the published baseline arm (matches Harvey harness narrative).
- Make **C**’s _primary_ structured path **SQL via DuckDB**, not filter-DSL
  `memory_recall`, for exact enumeration / frequency.
- Keep `memory_recall` for cross-session memory + hybrid semantic asks.
- Add **B** later as an optional third matrix arm when we want the “honest SQL
  vs SQL+memory” comparison — not required to unblock 018.

Do **not** give the baseline arm DuckDB for the Harvey-parity ledger unless we
explicitly reframe the paper as A/B/C. That changes the claim.

## What ClawQL still buys (even if SQL does enumeration)

1. **Unstructured → structured** — DMS starts as `.docx` trees. Path detectors +
   CLAWQL_* blocks + (future) LLM extract populate tables. Without that, SQL has
   nothing honest to query.
2. **Cross-session memory** — DuckDB file can be task-scoped and wiped; vault
   `memory_ingest` / `memory_recall` accumulate decisions across runs.
3. **Hybrid semantic + exact** — “client worried about timeline” is not a WHERE
   clause; Onyx / vector / keyword recall remains. SQL handles cohort math.

Ontology `memory_recall` filters are essentially a constrained SQL dialect the
model does not already know. DuckDB is the same capability with a universal UI.

## Answer-key boundary (critical)

Fair to precompute at ingest (mechanical index):

- Path / detector flags: `is_credit_facility`, `is_hsr_second_request`,
  `practice_area`, `matter_type`, client short name, evidence paths.
- **Content FTS / boolean columns** from a deterministic scan of extracted text,
  e.g. `mentions_springing_lien` = document text matches `(?i)springing\\s+lien`
  — same work a human would do loading files into DuckDB once.

**Not fair:**

- Hard-coding gold matter IDs (`1005-00001`, …) into tables or SQL templates.
- Pre-writing `frequency_pct = 0` / `n = 12` from `task.json` criteria.

So the illustrative query in the strategy note must be split:

```sql
-- 1) Cohort N (structure from ClawQL extract / path detectors)
SELECT matter_id, client_short_name
FROM matters
WHERE is_credit_facility = TRUE
ORDER BY matter_id;

-- 2) Rare attribute inside cohort (FTS or join to doc_hits)
SELECT
  COUNT(*) FILTER (WHERE mentions_springing_lien) AS k,
  COUNT(*) AS n
FROM matters
WHERE is_credit_facility = TRUE;
```

If `mentions_springing_lien` is built by the same ingest scan for every matter,
that is **Strategy C value** (index built once), not answer-key leak.

## Target schemas (LAB v0)

### `matters`

| Column | Source |
| ------ | ------ |
| `matter_id` | DMS folder name |
| `client_short_name` | existing `_client_hint` |
| `practice_area` | detector / CLAWQL_PRACTICE_AREA |
| `matter_type` | detector / CLAWQL_MATTER_TYPE |
| `title` | CLAWQL_TITLE |
| `is_credit_facility` | Fix 7 `detect_credit_facility` |
| `is_hsr_second_request` | existing HSR detector |
| `mentions_springing_lien` | mechanical text/path scan (task-018) |
| `has_revolving_facility` | establish-language / revolving-note path (task-024) |
| `vault_note_path` | seeded Memory/… path |
| `sandbox_root` | `/workspace/documents/matters/<id>` |

### Offline SQL possibility checks (not agent success)

| Task | Query shape | Local DMS result |
| ---- | ----------- | ---------------- |
| **018** | `COUNT` springing lien among `is_credit_facility` | **n=12 k=0**, ids = public gold-12 |
| **024** | `WHERE is_credit_facility AND has_revolving_facility` | **TP=4 FP=0 FN=0** vs gold `{1008,1012,1019-00002,1038-00002}` |
| **020** | incremental + `ORDER BY facility_amount_usd DESC` | **1005-00001** via IDP→DuckDB spike |
| **023** | `is_secured ORDER BY deal_date DESC` | **1013-00001** via IDP→DuckDB spike |

Full Tika → LangExtract → DuckDB flow:
[`harvey-lab-idp-matter-pipeline.md`](harvey-lab-idp-matter-pipeline.md).

Not every failed batch-3 cell is SQL-shaped: **016 / 017 / 019 / 021** are
documented Nemotron criterion ceilings — do not expect DuckDB alone to lift
those. **008** needs firm-made HSR *filing* chronology (distinct from
`is_hsr_second_request`).

### `documents` (optional v0.1)

| Column                    | Source                                             |
| ------------------------- | -------------------------------------------------- |
| `matter_id`               | parent                                             |
| `rel_path`                | path under matter                                  |
| `ext`                     | suffix                                             |
| `extracted_text`          | docx/txt extract (capped)                          |
| `mentions_springing_lien` | regex over extracted_text (and siblings as needed) |

FTS index on `extracted_text` enables ad-hoc rare-attribute SQL without a
dedicated boolean per phrase — preferred long-term.

## Tool surface for the ClawQL LAB arm

Expose **one** simple tool (names illustrative):

```text
clawql_sql / duckdb_query
  arguments: { "sql": "SELECT ..." }
  returns: { "columns": [...], "rows": [...], "rowCount": N, "error"?: "..." }
```

Guards:

- Read-only connection (no `ATTACH`, no `COPY TO`, no `INSTALL`).
- Statement allowlist: single `SELECT` / `WITH … SELECT`.
- Row cap (e.g. 500) + byte cap on cell text.
- Timeout (e.g. 5s).
- Preloaded DB path under task vault: e.g.
  `$CLAWQL_OBSIDIAN_VAULT_PATH/lab/matters.duckdb`.

Prompt change (Pattern F replacement for frequency):

1. `clawql_sql` to define cohort N (list `matter_id`).
2. `clawql_sql` or FTS for rare attribute **or** targeted grep under
   `sandbox_root` for the returned ids only.
3. `write` `k of N`.

Keep `clawql_memory_recall` for memory / hybrid; do not delete it.

## Mapping onto `clawql-data` (planned package)

When `packages/clawql-data` lands, LAB should consume it rather than own DuckDB:

| Concern   | LAB adapter (near-term)                         | `clawql-data` (target)                               |
| --------- | ----------------------------------------------- | ---------------------------------------------------- |
| Engine    | `duckdb` Python in harness or sidecar           | Shared Node/Python provider                          |
| Load      | Build `matters.duckdb` during ClawQL pre-ingest | `ingestStructured` / table sync from ontology + docs |
| Query MCP | Thin `duckdb_query` in LAB overlay              | First-class MCP tool `data_query`                    |
| AuthZ     | Task-scoped file, no network                    | Provider capabilities + tenant scope                 |
| Operator  | N/A                                             | `spec.data.duckdb` in operator-target-architecture   |

**Near-term spike (unblock LAB without waiting for the full package):**

1. In `clawql_lab_session._ingest_firm_knowledge_dms`, after detectors run, also
   write Parquet/CSV or directly create `matters.duckdb`.
2. Register `clawql_sql` beside existing clawql tools in the chat adapter.
3. Switch Pattern F prompts to SQL-first.
4. Log `SELECT count(*) FROM matters WHERE is_credit_facility` next to today’s
   `CREDIT_FACILITY flagged 12/266` line — same N, better agent UX.

**Later:** replace the spike with `clawql-data` and keep the same SQL dialect /
table names so agent skills transfer.

## Benchmark implications

- **018-class frequency:** SQL cohort + content flag/FTS should collapse
  40-turn loops toward a handful of turns — _if_ ingest columns are correct
  (Fix 7 precision remains a data problem, not an SQL problem).
- **001-class HSR enumeration:** SQL `WHERE is_hsr_second_request` + evidence
  paths columns; still need document cites (grep/read), not SQL alone.
- **Semantic tasks:** still memory/Onyx; SQL is the wrong tool — prompt must
  say so explicitly (“SQL for exact fields; recall/search for narrative”).

## Phased delivery

| Phase  | Scope                                                                     | Depends on                     |
| ------ | ------------------------------------------------------------------------- | ------------------------------ |
| **P0** | Design (this doc)                                                         | —                              | **done**        |
| **P1** | LAB spike: build duckdb at pre-ingest; `clawql_sql` tool; Pattern F → SQL | Fix 7/8                        | **in progress** |     | **P2** | Content FTS / `mentions_*` columns for frequency attrs | P1  |
| **P3** | Optional matrix arm **B** (SQL-only, shared tables)                       | Product call on ledger framing |
| **P4** | Promote into `packages/clawql-data` + MCP `data_query`                    | Package scaffold               |

## Non-goals (P1)

- ClickHouse / remote OLAP in GHA (DuckDB embedded is enough for 266 matters).
- Giving baseline arm DuckDB for Harvey-parity runs.
- Replacing vault memory with DuckDB persistence.
- Rubric-derived gold ID tables.

## Open questions

1. Should P1 ship as a **harness-local** DuckDB file only, or also mirror rows
   into `ontology.db` so SQL and structured recall stay consistent?
2. For rare attributes beyond springing lien, do we precompute booleans for a
   small phrase list, or only FTS?
3. When `clawql-data` exists, is LAB allowed to depend on it in GHA (Node native
   addons / Python duckdb wheel), or keep Python `duckdb` in the harvey-labs
   venv only?

## Suggested next action

After the live Fix 8 `18-18` cell settles: implement **P1 spike** on the ClawQL
arm only (no arm B yet), measure turns + all-pass on 018 vs Fix 8 MCP-only path.
