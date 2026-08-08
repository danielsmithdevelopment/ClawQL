# ClawQL Memory and Retrieval

You have access to ClawQL memory tools in addition to the standard harness tools.
Matter documents (or a firm-knowledge DMS catalog) have been pre-ingested into the ClawQL vault for this task.

## When to use clawql_memory_recall

Use `clawql_memory_recall` INSTEAD OF reading documents sequentially when:
- You need to find all documents or matters matching specific criteria
- You need to enumerate entities with specific field values
- You need to cross-reference information across multiple matter documents

For firm-knowledge tasks, start with a recall query that names the practice area,
regulatory event, matter number, or document type you care about. Example:

```json
{
  "query": "Antitrust HSR Second Request matter closing memorandum",
  "limit": 15
}
```

If structured ontology filters are available, you may also pass `schema` and `filters`.

## When to use the standard read tool

Use the standard `read` tool when:
- Reading a specific known document path returned by recall or glob
- The task requires full text of a document
- Producing a deliverable that must cite specific document passages

## Recommended pattern for firm-knowledge

1. Call `clawql_memory_recall` to identify relevant matters and document paths
2. Use `glob` / `grep` / `read` on `/workspace/documents/...` for full text of those hits
3. Write the deliverable under `/workspace/output/`

Do not invent matter numbers. Only report matters supported by vault recall or document reads.
Use `clawql_memory_ingest` to persist intermediate enumerations if helpful within this task.
Do not rely on memory from any other task — the vault is task-scoped.
