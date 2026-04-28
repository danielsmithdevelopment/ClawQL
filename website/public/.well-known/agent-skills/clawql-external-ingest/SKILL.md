---
name: clawql-external-ingest
description: Import external markdown or URL content using ingest_external_knowledge with dry-run-first validation.
---

# ClawQL ingest_external_knowledge workflows

## When to apply

- You need to import external docs into vault-backed memory.

## Workflow

1. Ensure `CLAWQL_EXTERNAL_INGEST=1`.
2. Start with `dryRun: true`.
3. Validate paths/scope/content.
4. Re-run with `dryRun: false`.
5. Confirm discoverability with `memory_recall`.

## Modes

- `documents[]` for bulk markdown.
- `source: "url"` for URL import (`CLAWQL_EXTERNAL_INGEST_FETCH=1`).
