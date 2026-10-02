# External ingest → continue

There is **no** pre-seeded vault note. The correct token lives only inside
`incoming/briefing.md` under `CLAWQL_EXTERNAL_TOKEN=…`.

## Steps

1. Read `incoming/briefing.md` (and optionally other `incoming/*.md` files).
2. Call **`ingest_external_knowledge`** (`clawql_ingest_external_knowledge`) with:
   - `source`: `"markdown"`
   - `dryRun`: **false** (must write — dry-run alone fails)
   - `documents`: at least the briefing markdown, path e.g.
     `Memory/openbench-external-briefing.md`, markdown = file contents
3. Call **`memory_recall`** querying `CLAWQL_EXTERNAL_TOKEN` / cedar / briefing.
4. Write relative path `answer.json`.

OpenCode names: `clawql_ingest_external_knowledge`, `clawql_memory_recall`.

## Artifact

```json
{
  "token": "<token value only, without the CLAWQL_EXTERNAL_TOKEN= prefix>",
  "source": "memory_recall"
}
```

## Rules

- Ignore `decoy/` (wrong token `maple-17`).
- Passing requires **both** ingest_external_knowledge and memory_recall tool_use
  in this run (filesystem copy alone is not enough).
- Stop after writing `answer.json`.
