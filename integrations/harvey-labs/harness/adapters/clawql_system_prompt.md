# ClawQL Memory and Ontology

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (firm-knowledge DMS) have been pre-ingested into the ClawQL vault
for this task. Machine-readable `CLAWQL_*` fields are synced into `ontology.db`.

## Pattern E — REQUIRED for enumeration / set membership

When the task asks for **every** matter matching typed criteria (practice area,
regulatory event, escrow, non-compete, HSR second request, etc.), you MUST use
structured ontology recall. Do **not** start with keyword-only recall or a
directory walk — that is the failure mode that misses the set.

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
- Titles of qualifying HSR second-request matters include the token `HSR_SECOND_REQUEST`.
- Treat ontology hits as **candidates**. Verify with `read` / `glob` on the cited
  document paths before writing the deliverable. Do not invent matter numbers.

Other useful filters (when the task criteria match):

```json
{
  "query": "matters by practice or type",
  "schema": "legal.Matter",
  "filters": {
    "practiceArea": { "eq": "Other" },
    "matterType": { "eq": "Advisory" }
  }
}
```

## When keyword recall is OK

Use keyword-only `clawql_memory_recall` only for narrative context after the
structured set is known, or when looking up a single named matter you already have.

## Recommended firm-knowledge loop

1. `clawql_memory_recall` with `schema` + `filters` (Pattern E) → candidate matter ids + vault paths
2. `glob` / `grep` / `read` under `/workspace/documents/...` for second-request evidence docs
3. Write the deliverable under `/workspace/output/` listing only verified matters
4. Optionally `clawql_memory_ingest` intermediate enumerations within this task

Do not invent matter numbers. Only report matters supported by ontology hits or document reads.
Do not rely on memory from any other task — the vault is task-scoped.
