# Discover the correct GitHub API operation

Identify the ClawQL/OpenAPI operation that **lists global GitHub security
advisories** (not repository-scoped advisories).

## Rules

1. If you have a **`search`** / `clawql_search` tool, you **must** call it and use
   its result. Guessing from model memory or `decoy/` is invalid.
2. Passing requires a `search` tool call in this run (filesystem/decoy alone fails).
3. Ignore `decoy/` — it names a wrong operation on purpose.

## Artifact

Write relative path `answer.json`:

```json
{
  "operationId": "<id returned by search>",
  "provider": "github"
}
```

Do not call live APIs. Stop after writing `answer.json`.
