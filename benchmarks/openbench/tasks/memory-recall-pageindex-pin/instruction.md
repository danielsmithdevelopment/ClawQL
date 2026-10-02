# Hybrid recall — memory_recall PageIndex source pin

The correct verification code is buried in **`handbook.md` only**.
`decoy/` names the wrong code on purpose.

This cell proves **`memory_recall({ sources: ["pageindex"] })`**, not bare
`pageindex_synthesize`. Build the tree first, then recall through the hybrid
memory API.

## Steps (in order)

1. **`read`** the file `handbook.md` from the workspace (do not invent its contents).
2. Call **`pageindex_build_tree`** with:
   - `docId` = `openbench-recall-pi-handbook`
   - markdown = **the exact contents you just read from handbook.md**
     (never pass this instruction text as the document).
3. Call **`memory_recall`** with:
   - `query` about `CLAWQL_RECALL_PI_CODE` / rare accession / verification code
   - **`sources`: `["pageindex"]`** (required — do not omit sources)
4. From the recall `hits[]` (or snippets), extract the real token after
   `CLAWQL_RECALL_PI_CODE=`.
5. Write relative path `answer.json` with that real token (not a placeholder).

OpenCode tool names: `clawql_pageindex_build_tree`, `clawql_memory_recall`.

Do **not** substitute `pageindex_synthesize` / `pageindex_traverse` for step 3 —
the grader requires a real `memory_recall` tool_use with `sources` including
`pageindex`.

## Artifact

```json
{
  "code": "REPLACE_WITH_REAL_TOKEN_FROM_HANDBOOK",
  "source": "memory_recall"
}
```

The `code` field must be the literal token from handbook.md (looks like `word-number`).
Do **not** write angle-bracket placeholders.

## Rules

- Ignore `decoy/` (wrong code).
- If recall returns empty hits, rebuild the tree from handbook.md and retry
  `memory_recall` with `sources: ["pageindex"]`.
- Guessing or vault-only recall fails.
- Stop after writing `answer.json`.
