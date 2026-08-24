# ClawQL Memory and Ontology

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (firm-knowledge DMS) have been pre-ingested into the ClawQL vault
for this task. Machine-readable `CLAWQL_*` fields are synced into `ontology.db`.

## Step 0 — Classify the task (REQUIRED, before any recall)

Read the user prompt and pick **one** task kind. Write it silently into your plan
(do not invent ontology flags to match a wrong kind).

| Kind | Prompt signals | Retrieval | Wonder / stop |
| ---- | -------------- | --------- | ------------- |
| `enumeration` | every / all matters / list / enumerate / which matters (plural set) | Pattern E **only if** second-request language is explicit | Verify each listed matter |
| `frequency` | how often / what share / percentage / across / how many of / market practice | **Define N first** via practice-group / deal-type recall; then attribute search | Stop when filtered set covered; write **k of N** with matter IDs |
| `single_answer` | most recent / latest / first / what's our / which matter (one answer) | Standard matter recall + targeted docs — **not** Pattern E unless prompt says second request | **1–2 targeted greps only** |
| `comparison` | compare / versus / between named matters | Targeted recall/read on those matters | Brief verification |
| `timeline` | chronology / sequence / ordering over time | Chronological search | Ordering check only |

If signals conflict: `frequency` > `enumeration` > `single_answer` when “across / how often” is present; otherwise prefer `single_answer` over `enumeration`.

**HSR filing ≠ HSR second request.** “Most recent matter where we made an HSR
**filing**” is `single_answer` about a filing (transmittal / form), **not** an
enumeration of second-request matters.

## Constitutional principles (non-negotiable)

1. **Never finish with empty `/workspace/output/`.** The judge only reads files
   there. Chat text is not graded.
2. **Always write a deliverable that attempts every rubric criterion** with the
   best evidence you have. Partial credit beats silence. If something could not
   be confirmed, say so in the file — do not omit the criterion entirely.
3. **Negative results are complete answers.** When searching for entities matching
   a criterion and finding **none** after covering the relevant corpus (or the
   stated matter set), write **0 of N / none / 0%** as the deliverable. Absence
   of hits is evidence of absence for a complete search — do **not** keep
   bash/grep hunting forever hoping for a positive hit (task 018 failure mode).
4. **Do not invent matter IDs.** Only report matters supported by ontology hits
   or document reads.
5. **Never dump the whole DMS into context.** Do **not** run `ls -R`,
   `find /workspace/documents` without a tight filter, or unbounded greps over
   the entire tree. Prefer targeted `glob` / `grep` with a matter path or a
   specific filename pattern. Oversized tool output is truncated, but you still
   waste turns.
6. **Guilty until proven (deliverable grounding).** Distinctive legal terms and
   matter claims start **untrusted**. Verify against cited source text — but
   respect the Wonder budget for the task kind (above). Do not invent plausible
   firm language or ontology flags (batch-1 failure: fabricated `COVENANT-LITE`).
7. **Partial hits after fallback are unresolved, not confirmed.** If grep/read
   after empty recall only finds weak/partial matches, mark criteria unresolved
   in the deliverable. Do not Wonder-verify a partial match into a confident
   wrong answer.
8. **Use ClawQL recall at least once** on firm-knowledge before spending the run
   on bash-only search. Call `clawql_memory_recall` early; empty structured
   results are still information.
9. **Frequency denominator = prompt filter, not folder geography.** For
   frequency / survey tasks, **N** is the count of matters matching the
   prompt’s practice group / deal type (e.g. Banking & Finance credit
   facilities). Recall that **cohort** first and **list every matter id**.
   Then search for the rare attribute inside that set only. Write
   **k of N (…%)** with the id list (or **0 of N** if none). Wrong
   denominators that fail grading: counting directories named
   `Credit Agreement`, or “all vault notes” / entire DMS (task 018
   post-fix failure: wrote 0 of 5 / 0 of 266 instead of 0 of 12).
10. **DuckDB NULL ≠ false.** Semantic columns
    (`has_maintenance_financial_covenant`, `is_covenant_lite`, MFN, EBITDA
    add-backs, etc.) may be **NULL = unknown**. Do **not** conclude absence
    from `WHERE col` empty / `col = false` when many rows are NULL. Instead:
    `SELECT matter_id, <col>, <col>_proof_doc FROM matters WHERE …`,
    query `open_facts` for surface hits, then `read` the proof / agreement
    text before asserting k of N.
11. **open_facts is L0 evidence, not a verdict.** Rows like
    `surface.financial_maintenance_covenant` mean the phrase appeared — still
    verify the governing document before marking a typed Matter flag true.

## HARD REQUIREMENT — graded deliverable

Before you stop making tool calls you MUST call the harness `write` tool with a
path under `/workspace/output/` (e.g. `matters-enumeration.md` or `response.md`).

When the task is an **HSR second-request enumeration**, for **each** qualifying
matter include:

- Matter id (e.g. `1038-00001`)
- Client short name used in firm materials (**Cascade Retail**, **Harrowgate PE**,
  **Solara Digital**, **Halcyon Semi** — do not truncate to “Cascade” / “Solara”)
- One **Second Request evidence** document path under
  `/workspace/documents/matters/<matter-id>/...`
- Explicit language that the matter **qualifies** (received an HSR second request)

For **single_answer** tasks, structure the file around the **one** best answer
(or “unresolved” if evidence is insufficient). Do not expand into a multi-matter
enumeration unless the prompt asks for a set.

For **frequency** tasks, the deliverable **must**:

- State **k of N (…%)** (e.g. `0 of 12 (0%)`)
- **List every matter id** that constitutes N (the prompt’s filtered set)
- Not substitute folder counts or whole-vault counts for N

## Evidence document selection

### HSR second-request tasks only

Cite a document that **shows the Second Request**, not an engagement letter.
Prefer (and name one of these when present):
**`substantial-compliance-certification-letter`**,
**`custodian-identification-collection-protocol`**,
`second-request-strategy-memo`, `hsr-withdrawal-letter`, `joint-status-report`,
`case-assessment-memo`, `letter-ftc-meet-and-confer`.
When SQL returns `hsr_second_request_proof_doc`, **cite that exact filename**
in `response.md` (especially for Solara / 1041-00001).

For **most recent / latest** second-request matter, treat as **single_answer**:
name **only** the one latest matter (by `hsr_second_request_date DESC NULLS LAST`).
Do **not** enumerate every second-request matter as a "qualifying set" or
frequency denominator — that over-asserts matters the rubric rejects.

### Billion-dollar-plus M&A frequency

Define N with the view `billion_dollar_antitrust_ma` (or equivalent):

```sql
SELECT matter_id, client_short_name, deal_value_usd, is_hsr_second_request
FROM billion_dollar_antitrust_ma
ORDER BY deal_value_usd DESC;
-- equivalent:
-- WHERE deal_value_usd >= 1200000000
--   AND (is_hsr_second_request OR has_ma_execution_agreement)
```

Do **not** require `is_hsr_second_request` when defining N (that is k).
Never use the whole vault or every `deal_value_usd >= 1B` row as N.
Report `k of N` and list every population member.

### Maintenance-covenant / credit-facility enumeration

This is an **enumeration** (not single_answer): list **every** live credit
facility with `has_maintenance_financial_covenant = true`. Filter that column
(not all credit facilities). **Precision:** do **not** list matters where
maintenance is `false` or `NULL` (e.g. covenant-lite 1005/1008/1021) as
qualifying. For each qualifying matter, cite
`has_maintenance_financial_covenant_proof_doc` by **filename**. Use the
`client_short_name` column as the client label. Do not collapse to one
“most recent” matter.

### HSR clearance / post-clearance tasks

When asked for a clearance document, prefer filenames containing
`post-clearance-status-memo` (or explicit early termination / grant of
early termination). Do **not** substitute substantial-compliance letters
for clearance unless the prompt asks for compliance certification.

### HSR filing (model filing) tasks

Cite filing artifacts such as `hsr-filing-transmittal-letter` or
`hsr-form-acquiring-person` — **not** second-request strategy memos unless the
prompt asks about second requests.

## Pattern E — ONLY when the prompt explicitly concerns second requests

Use **SQL first** for the cohort + proof paths (DuckDB flags are set at ingest):

```sql
SELECT matter_id, client_short_name, hsr_second_request_proof_doc
FROM matters
WHERE is_hsr_second_request
ORDER BY matter_id;
```

Then structured ontology recall with `HSR_SECOND_REQUEST` **only if** the task
explicitly mentions second request / second-request compliance / Second Request
process (or clearly asks for every matter that received one) — and SQL is empty
or you need `preferredEvidence` / `clientShortName` enrichment:

```json
{
  "query": "antitrust HSR second request matters",
  "schema": "legal.Matter",
  "filters": {
    "title": { "contains": "HSR_SECOND_REQUEST" }
  },
  "limit": 50
}
```

**Evidence citation (hard rule):** For each listed matter, cite a path from
`preferredEvidence` on the recall hit (or `hsr_second_request_proof_doc` from
SQL). `read` that file under `/workspace/documents/...` before writing the
deliverable. Do **not** invent or substitute other `second-request*.docx` paths
from sibling matters. Gold-style proofs include `joint-status-report`,
`case-assessment-memo`, `letter-ftc-meet-and-confer`,
`substantial-compliance-certification`, `custodian-identification-collection-protocol`,
and `second-request-strategy-memo` (Harrowgate).
## Pattern F — credit-facility / Banking & Finance frequency cohorts

When the prompt asks how often / what share across **Banking & Finance credit
facilities** (or similar), define N with **SQL first** (`clawql_sql`):

```sql
SELECT matter_id, client_short_name
FROM matters
WHERE is_credit_facility
ORDER BY matter_id;
```

Then measure the rare attribute (prefer SQL content index when present):

```sql
SELECT
  count(*) FILTER (WHERE mentions_springing_lien) AS k,
  count(*) AS n
FROM matters
WHERE is_credit_facility;
```

Fallback: structured `clawql_memory_recall` with `schema: legal.Matter` and
`title` contains `CREDIT_FACILITY` (limit ≤ 50). Treat **`matterIds`** /
**`matterIdCount`** as authoritative N.

Rules:
- Always pass both `schema: "legal.Matter"` and a non-empty `filters` object when
  using Pattern E or F.
- **Do not** use Pattern E for generic “HSR filing”, “most recent antitrust
  matter”, covenant-lite, MFN, escrow, springing lien, or other non–second-request
  asks.
- For springing-lien / market-practice frequency, use **Pattern F** (cohort), not
  a fabricated `title contains "springing lien"` filter.
- Do **not** invent ontology title flags beyond seeded tokens
  (`HSR_SECOND_REQUEST`, `CREDIT_FACILITY`).
- If structured recall returns **no hits**, fall back (below) — do not invent
  filters forever.
- Ontology hits include `entityId`, `clientShortName`, `preferredEvidence`,
  `sandboxDocumentRoot`. Do **not** `read` vault paths (`Memory/...`).

## Fallback when structured recall is insufficient (REQUIRED)

If `clawql_memory_recall` with schema/filters returns no results or clearly
insufficient coverage after **at most 2** attempts:

1. Stop repeating the same failing recall/filter.
2. Fall back to harness tools: targeted `grep` / `glob` / `read` under
   `/workspace/documents/matters/...` (narrow paths; use `head` in bash).
3. Write the deliverable. If the attribute is absent from the **filtered**
   frequency set, write **0 of N (0%)** with the matter id list for N. If
   fallback only yields weak partial matches on other task kinds, mark those
   criteria **unresolved**.
4. Never terminate after a failed recall without writing `/workspace/output/`.

## Recommended firm-knowledge loop

1. Classify task kind (Step 0).
2. **Always** call `clawql_memory_recall` at least once early.
3. If `frequency` → recall the **filtered cohort** first (define N + matter
   ids), then attribute search inside that set only.
4. If `enumeration` **and** second-request language is explicit → Pattern E.
   Else → standard recall / targeted document search (no `HSR_SECOND_REQUEST`).
5. `write` the deliverable (`k of N` with ids when frequency; including 0 of N).
6. Wonder within budget: enumeration → verify listed matters; frequency →
   verify **N is the prompt filter with ids listed**; single_answer →
   **1–2 greps**.
7. Optionally `clawql_memory_ingest` intermediate notes within this task.

The vault is task-scoped.
