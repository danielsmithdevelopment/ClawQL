# ClawQL Memory and Ontology

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (firm-knowledge DMS) have been pre-ingested into the ClawQL vault
for this task. Machine-readable `CLAWQL_*` fields are synced into `ontology.db`.

## Constitutional principles (non-negotiable)

1. **Never finish with empty `/workspace/output/`.** The judge only reads files
   there. Chat text is not graded.
2. **Always write a deliverable that attempts every rubric criterion** with the
   best evidence you have. Partial credit beats silence. If something could not
   be confirmed, say so in the file — do not omit the criterion entirely.
3. **Do not invent matter IDs.** Only report matters supported by ontology hits
   or document reads.
4. **Never dump the whole DMS into context.** Do **not** run `ls -R`,
   `find /workspace/documents` without a tight filter, or unbounded greps over
   the entire tree. Prefer targeted `glob` / `grep` with a matter path or a
   specific filename pattern. Oversized tool output is truncated, but you still
   waste turns.
5. **Guilty until proven (deliverable grounding).** Distinctive legal terms,
   ontology-style flags, and matter claims start **untrusted**. Before finishing,
   verify each against cited source document text (targeted `grep` on the cited
   path). If it is not in the documents, remove it or mark unconfirmed — do not
   invent plausible firm language (batch-1 failure mode: fabricated
   `COVENANT-LITE` ontology flags).

## HARD REQUIREMENT — graded deliverable

Before you stop making tool calls you MUST call the harness `write` tool with a
path under `/workspace/output/` (e.g. `matters-enumeration.md` or `response.md`).

When the task is an HSR second-request enumeration, for **each** qualifying
matter include:

- Matter id (e.g. `1038-00001`)
- Client short name used in firm materials (**Cascade Retail**, **Harrowgate PE**,
  **Solara Digital**, **Halcyon Semi** — do not truncate to “Cascade” / “Solara”)
- One **Second Request evidence** document path under
  `/workspace/documents/matters/<matter-id>/...`
- Explicit language that the matter **qualifies** (received an HSR second request)

For other task types, mirror the rubric structure (one section or row per
criterion) even if evidence is incomplete.

## Evidence document selection (critical for HSR tasks)

Cite a document that **shows the Second Request**, not an engagement letter.

Prefer filenames containing any of:

- `second-request-strategy-memo`
- `hsr-withdrawal-letter`
- `joint-status-report`
- `case-assessment-memo`
- `letter-ftc-meet-and-confer`
- `substantial-compliance-certification`
- `custodian-identification-collection-protocol`

Ontology / seed notes list **Preferred Second Request evidence** per matter —
use those paths when present.

## Pattern E — REQUIRED for typed set membership when the ontology flag exists

When the task asks for **every** matter matching a typed flag that the seed
indexed (today: HSR second request → `HSR_SECOND_REQUEST`), you MUST use
structured ontology recall:

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

Rules:
- Always pass both `schema: "legal.Matter"` and a non-empty `filters` object.
- `query` is an audit hint; **filters drive retrieval**.
- Ontology hits include `entityId` / `fields.id`, `clientShortName`,
  `preferredEvidence`, and `sandboxDocumentRoot`. Use those — do **not** try to
  `read` vault paths such as `Memory/...md` (vault is outside the sandbox).
- Do **not** invent other ontology title flags (e.g. `COVENANT-LITE`) unless a
  hit already shows that token. If structured recall returns **no hits**, treat
  that as a signal to fall back (below) — not to invent filters forever.

## Fallback when structured recall is insufficient (REQUIRED)

If `clawql_memory_recall` with schema/filters returns no results or clearly
insufficient coverage after **at most 2** attempts:

1. Stop repeating the same failing recall/filter.
2. Fall back to harness tools: targeted `grep` / `glob` / `read` under
   `/workspace/documents/matters/...` (narrow paths; use `head` in bash).
3. Write the deliverable with whatever you found. Never terminate after a failed
   recall without writing `/workspace/output/`.

## Recommended firm-knowledge loop

1. Try `clawql_memory_recall` with `schema` + `filters` when an ontology flag
   matches the task (Pattern E for HSR).
2. If hits exist: `glob` / `read` under each hit's `sandboxDocumentRoot`, focusing
   on preferred evidence filenames.
3. If hits are empty/insufficient after ≤2 attempts: targeted document search.
4. `write` the deliverable to `/workspace/output/` (required) — attempt all
   criteria.
5. Optionally `clawql_memory_ingest` intermediate notes within this task.

The vault is task-scoped.
