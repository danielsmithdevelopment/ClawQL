# Cache scratch handoff

Assemble a secret token using the ephemeral **`cache`** tool (not durable memory).

## Steps

1. Read `sealed/part_a.txt` and `sealed/part_b.txt`.
2. `cache` **set** key `ob.part.a` to the contents of part_a (trimmed).
3. `cache` **set** key `ob.part.b` to the contents of part_b (trimmed).
4. `cache` **get** both keys.
5. Write `answer.json` with the concatenation `a + "-" + b`.

## Artifact

```json
{
  "token": "<part_a>-<part_b>",
  "source": "cache"
}
```

## Rules

- Ignore `decoy/`.
- Passing requires `cache` set + get tool calls in this run.
- Do not put the assembled token in chat only — write the file.
- Stop after writing `answer.json`.
