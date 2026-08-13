# ClawQL Memory and Ontology

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (firm-knowledge DMS) have been pre-ingested into the ClawQL vault
for this task. Machine-readable `CLAWQL_*` fields are synced into `ontology.db`.

## Step 0 — Classify the task (REQUIRED, before any recall)

Read the user prompt and pick **one** task kind. Write it silently into your plan
(do not invent ontology flags to match a wrong kind).

| Kind | Prompt signals | Retrieval | Wonder budget |
| ---- | -------------- | --------- | ------------- |
| `enumeration` | every / all matters / list / enumerate / which matters (plural set) | Pattern E **only if** second-request language is explicit | Full grounding of each listed matter |
| `single_answer` | most recent / latest / first / what's our / which matter (one answer) | Standard matter recall + targeted docs — **not** Pattern E unless prompt says second request | **1–2 targeted greps only** |
| `comparison` | compare / versus / between named matters | Targeted recall/read on those matters | Brief verification of cited claims |
| `timeline` | chronology / sequence / ordering over time | Chronological search on relevant matters | Ordering check only |

If signals conflict, prefer `single_answer` over `enumeration` (safer).

**HSR filing ≠ HSR second request.** “Most recent matter where we made an HSR
**filing**” is `single_answer` about a filing (transmittal / form), **not** an
enumeration of second-request matters.

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
5. **Guilty until proven (deliverable grounding).** Distinctive legal terms and
   matter claims start **untrusted**. Verify against cited source text — but
   respect the Wonder budget for the task kind (above). Do not invent plausible
   firm language or ontology flags (batch-1 failure: fabricated `COVENANT-LITE`).
6. **Partial hits after fallback are unresolved, not confirmed.** If grep/read
   after empty recall only finds weak/partial matches, mark criteria unresolved
   in the deliverable. Do not Wonder-verify a partial match into a confident
   wrong answer.

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

## Evidence document selection

### HSR second-request tasks only

Cite a document that **shows the Second Request**, not an engagement letter.
Prefer: `second-request-strategy-memo`, `hsr-withdrawal-letter`,
`joint-status-report`, `case-assessment-memo`, `letter-ftc-meet-and-confer`,
`substantial-compliance-certification`, `custodian-identification-collection-protocol`.

### HSR filing (model filing) tasks

Cite filing artifacts such as `hsr-filing-transmittal-letter` or
`hsr-form-acquiring-person` — **not** second-request strategy memos unless the
prompt asks about second requests.

## Pattern E — ONLY when the prompt explicitly concerns second requests

Use structured ontology recall with `HSR_SECOND_REQUEST` **only if** the task
explicitly mentions second request / second-request compliance / Second Request
process (or clearly asks for every matter that received one).

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
- Always pass both `schema: "legal.Matter"` and a non-empty `filters` object when
  using Pattern E.
- **Do not** use Pattern E for generic “HSR filing”, “most recent antitrust
  matter”, covenant-lite, MFN, escrow, or other non–second-request asks.
- For those, use keyword/`legal.Matter` recall **without** inventing title flags,
  then targeted `grep` / `read` under `/workspace/documents/matters/...`.
- Do **not** invent ontology title flags (e.g. `COVENANT-LITE`). If structured
  recall returns **no hits**, fall back (below) — do not invent filters forever.
- Ontology hits include `entityId`, `clientShortName`, `preferredEvidence`,
  `sandboxDocumentRoot`. Do **not** `read` vault paths (`Memory/...`).

## Fallback when structured recall is insufficient (REQUIRED)

If `clawql_memory_recall` with schema/filters returns no results or clearly
insufficient coverage after **at most 2** attempts:

1. Stop repeating the same failing recall/filter.
2. Fall back to harness tools: targeted `grep` / `glob` / `read` under
   `/workspace/documents/matters/...` (narrow paths; use `head` in bash).
3. Write the deliverable. If fallback only yields **partial** matches, mark those
   criteria **unresolved** — do not treat partial hits as confirmed and do not
   spend a long Wonder loop proving them.
4. Never terminate after a failed recall without writing `/workspace/output/`.

## Recommended firm-knowledge loop

1. Classify task kind (Step 0).
2. If `enumeration` **and** second-request language is explicit → Pattern E.
   Else → standard recall / targeted document search (no `HSR_SECOND_REQUEST`).
3. `write` the deliverable (single answer vs set — match the kind).
4. Wonder within budget: enumeration → verify listed matters; single_answer →
   **1–2 greps** on the cited path for the one claim (or rewrite if you listed
   many matters on a single-answer task — that is a framing error).
5. Optionally `clawql_memory_ingest` intermediate notes within this task.

The vault is task-scoped.
