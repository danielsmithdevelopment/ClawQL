# Onyx mock cite

Ground the answer in enterprise evidence via ClawQL **`knowledge_search_onyx`**
(OpenCode: `clawql_knowledge_search_onyx`). Upstream Onyx HTTP is stubbed in CI.

## Steps

1. Call **`clawql_knowledge_search_onyx`** with a query about pricing policy
   (e.g. `enterprise pricing policy`).
2. From the tool result, extract the marker code that appears after
   `CLAWQL_ONYX_CODE=` (exact value `quartz-21`).
3. Write relative path `citations.json`.

## Artifact

```json
{
  "code": "quartz-21",
  "source": "knowledge_search_onyx"
}
```

## Rules

- Ignore `decoy/`.
- Inventing `citations.json` without a real `clawql_knowledge_search_onyx` tool_use fails.
- Stop after writing `citations.json`.
