# Cache scratch handoff

Assemble a secret token using the ephemeral **`clawql_cache`** tool
(OpenCode lists it as `clawql_cache`, not `cache`).

## Steps

1. Read `sealed/part_a.txt` and `sealed/part_b.txt`.
2. Call **`clawql_cache`** with:
   `{"operation":"set","key":"ob.part.a","value":"<part_a trimmed>"}`
3. Call **`clawql_cache`** with:
   `{"operation":"set","key":"ob.part.b","value":"<part_b trimmed>"}`
4. Call **`clawql_cache`** with `{"operation":"get","key":"ob.part.a"}` and the same for `ob.part.b`.
5. Write relative path `answer.json` (filePath exactly `answer.json`) with `a + "-" + b`.

## Artifact

```json
{
  "token": "<part_a>-<part_b>",
  "source": "cache"
}
```

## Rules

- Ignore `decoy/`.
- Passing requires `clawql_cache` set + get tool calls in this run.
- Do not invent the token from sealed files alone — you must use clawql_cache.
- Stop after writing `answer.json`.
