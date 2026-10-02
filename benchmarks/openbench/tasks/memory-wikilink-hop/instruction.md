# Memory wikilink hop

The correct OpenBench wiki token lives in a **linked** vault note, not in the
hub note your query will match first.

## Steps

1. Call **`clawql_memory_recall`** with:
   - `query`: `Alpha Hub` (or similar — must match the hub note)
   - `maxDepth`: at least `1` so wikilink expansion can reach `[[Beta Fact]]`
2. From recall results, find `CLAWQL_WIKI_TOKEN=` and take the value after `=`
   (exact value `opal-33`).
3. Write relative path `answer.json`.

## Artifact

```json
{
  "token": "opal-33",
  "source": "memory_recall"
}
```

## Rules

- Ignore `decoy/`. Wrong token `zinc-00` fails.
- Inventing `answer.json` without a real `clawql_memory_recall` tool_use fails.
- Stop after writing `answer.json`.
