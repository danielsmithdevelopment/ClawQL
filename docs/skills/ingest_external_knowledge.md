# Skill: `ingest_external_knowledge`

Import external Markdown or URL content into vault memory pipelines.

## When to Use

- You have curated external docs to add to knowledge memory.
- You need an auditable imported snapshot in the vault.
- You want to stage content before recall/index use.

## Common Workflow

1. Enable `CLAWQL_EXTERNAL_INGEST=1`.
2. Start with `dryRun: true`.
3. Validate `documents` paths or URL target scope.
4. Re-run with `dryRun: false`.
5. Use `memory_recall` to confirm discoverability.

## Patterns

### Pattern A: Bulk Markdown import

- `documents[]` with vault-relative `.md` paths
- best for internal runbooks or migration notes

### Pattern B: URL snapshot import

- `source: "url"` + `url`
- requires `CLAWQL_EXTERNAL_INGEST_FETCH=1`

### Pattern C: Roadmap preview

- call without payload to inspect current ingest roadmap output

## Tips

- Keep imports scoped; avoid noisy dumps.
- Use predictable paths under `Memory/external/`.
- For recurring sources, document update cadence in the note body.
