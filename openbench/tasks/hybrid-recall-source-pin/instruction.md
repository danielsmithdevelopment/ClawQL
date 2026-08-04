# Hybrid recall — PageIndex source pin

The correct verification code is buried in `handbook.md`. A vault-style decoy
in `decoy/` names the wrong code on purpose.

## Steps

1. Build a PageIndex tree from `handbook.md` using **`pageindex_build_tree`**
   with `docId` = `openbench-hybrid-handbook`.
2. Call **`pageindex_synthesize`** (or `pageindex_traverse`) asking for the
   hybrid verification code / `CLAWQL_HYBRID_CODE`.
3. Optionally call **`memory_recall`** with `sources: ["pageindex"]` — but the
   graded path still requires PageIndex tool_use (vault keyword alone fails).
4. Write relative path `answer.json`.

OpenCode tool names: `clawql_pageindex_build_tree`, `clawql_pageindex_synthesize`,
`clawql_pageindex_traverse`, `clawql_memory_recall`.

## Artifact

```json
{
  "code": "<value after CLAWQL_HYBRID_CODE=>",
  "source": "pageindex"
}
```

## Rules

- Ignore `decoy/` (wrong code).
- Guessing from decoy or training data fails — PageIndex tool_use is required.
- filePath must be exactly `answer.json`.
- Stop after writing `answer.json`.
