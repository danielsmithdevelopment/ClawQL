# Discover the correct GitHub API operation

You must identify the **exact** ClawQL / OpenAPI `operationId` that lists
**global** GitHub security advisories (not repository-scoped advisories).

## Critical rule

If you have a **`search`** (or `clawql_search`) tool, you **must** call it before
writing an answer. Query for global security advisories / list global advisories.
Do **not** trust `decoy/` notes — they name a wrong operation on purpose.

If you do **not** have search, you may only use workspace files (including decoys).

## Required artifact

Write a JSON file at relative path `answer.json` (not absolute paths) with:

```json
{
  "operationId": "<exact operation id from search>",
  "provider": "github"
}
```

Do not call live APIs. The checker only validates the discovered operation id.
Stop after writing `answer.json`.
