# PageIndex section Q&A

Find the OpenBench verification code buried in `catalog.md` without pasting the
whole file into chat.

## Steps (requires PageIndex tools)

1. Read `catalog.md` (or pass its markdown) into **`pageindex_build_tree`**
   with `docId` = `openbench-catalog`.
2. Call **`pageindex_synthesize`** (or `pageindex_traverse`) with a query about
   the rare cultivars / verification code / CLAWQL_PAGEINDEX_CODE.
3. Write relative path `answer.json`.

OpenCode lists these tools as `clawql_pageindex_build_tree`,
`clawql_pageindex_synthesize`, `clawql_pageindex_traverse`.

## Artifact

```json
{
  "code": "<value after CLAWQL_PAGEINDEX_CODE=>",
  "source": "pageindex"
}
```

## Rules

- Ignore `decoy/` (wrong code on purpose).
- Passing requires a PageIndex tool_use in this run (guessing fails).
- filePath for the answer must be exactly `answer.json` (relative).
- Stop after writing `answer.json`.
