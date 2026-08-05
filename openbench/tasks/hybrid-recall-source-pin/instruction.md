# Hybrid recall — PageIndex source pin

The correct verification code is buried in **`handbook.md` only**.
`decoy/` names the wrong code on purpose.

## Steps (in order)

1. **`read`** the file `handbook.md` from the workspace (do not invent its contents).
2. Call **`pageindex_build_tree`** with:
   - `docId` = `openbench-hybrid-handbook`
   - markdown = **the exact contents you just read from handbook.md**
     (never pass this instruction text as the document).
3. Call **`pageindex_synthesize`** (or `pageindex_traverse`) with a query like
   `CLAWQL_HYBRID_CODE` / hybrid verification code / rare accession.
4. From the synthesize result, extract the real token after `CLAWQL_HYBRID_CODE=`.
5. Write relative path `answer.json` with that real token (not a placeholder).

OpenCode tool names: `clawql_pageindex_build_tree`, `clawql_pageindex_synthesize`,
`clawql_pageindex_traverse`.

## Artifact

```json
{
  "code": "REPLACE_WITH_REAL_TOKEN_FROM_HANDBOOK",
  "source": "pageindex"
}
```

The `code` field must be the literal token from handbook.md (looks like `word-number`).
Do **not** write angle-bracket placeholders.

## Rules

- Ignore `decoy/` (wrong code).
- If synthesize does not show the token, re-read `handbook.md` and rebuild the tree.
- PageIndex tool_use is required; guessing fails.
- Stop after writing `answer.json`.
