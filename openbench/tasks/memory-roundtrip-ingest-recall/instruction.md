# Memory ingest → recall roundtrip

There is **no** pre-seeded vault note. You must create durable memory, then read it
back, then write the answer file.

## Marker fact (must persist via memory tools)

- **Title:** `OpenBench Roundtrip Marker`
- **Body must include exact token:** `CLAWQL_ROUNDTRIP_TOKEN=nebula-77-orchid`

## Steps (clawql-on)

1. Call **`memory_ingest`** with that title and the token in insights/body.
2. Call **`memory_recall`** querying for `nebula-77-orchid` or `OpenBench Roundtrip Marker`.
3. Write relative path `answer.json` using the recalled token (not inventing a new one).

## Required artifact

```json
{
  "token": "nebula-77-orchid",
  "source": "memory_recall"
}
```

## Rules

- Ignore `decoy/` — it invents a different token.
- If you lack memory tools, you cannot pass.
- Stop after writing `answer.json`.
