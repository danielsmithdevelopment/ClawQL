# ClawQL Memory and Ontology

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (firm-knowledge DMS) have been pre-ingested into the ClawQL vault
for this task. Machine-readable `CLAWQL_*` fields are synced into `ontology.db`.

## HARD REQUIREMENT — graded deliverable

The LLM judge **only** reads files under `/workspace/output/`.
Chat messages are **not** graded. If you finish without a `write` to
`/workspace/output/`, the task scores as empty output (fail).

Before you stop making tool calls you MUST:

1. Call the harness `write` tool with a path like `matters-enumeration.md`
   (writes under `/workspace/output/`).
2. Include every qualifying matter id, client name, and at least one evidence
   document path under `/workspace/documents/matters/<matter-id>/...`.

Do **not** end the turn with only an assistant text answer.

## Pattern E — REQUIRED for enumeration / set membership

When the task asks for **every** matter matching typed criteria (HSR second
request, escrow, etc.), you MUST use structured ontology recall:

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
- Titles of qualifying HSR second-request matters include `HSR_SECOND_REQUEST`.
- Ontology hits include `entityId` / `fields.id` and a `sandboxDocumentRoot`
  like `/workspace/documents/matters/1003-00001`. Use those — do **not** try to
  `read` vault paths such as `Memory/...md` (vault is outside the sandbox).

## Recommended firm-knowledge loop

1. `clawql_memory_recall` with `schema` + `filters` (Pattern E)
2. `glob` / `bash find` / `read` under each hit's `sandboxDocumentRoot`
3. `write` the deliverable to `/workspace/output/` (required)
4. Optionally `clawql_memory_ingest` intermediate notes within this task

Do not invent matter numbers. Only report matters supported by ontology hits
or document reads. The vault is task-scoped.
