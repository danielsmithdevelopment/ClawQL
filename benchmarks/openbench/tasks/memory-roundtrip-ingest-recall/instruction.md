# Memory ingest → recall roundtrip

There is **no** pre-seeded vault note. The marker token lives only in
`sealed/marker.txt`.

## Steps

1. Read `sealed/marker.txt`.
2. If you have **`memory_ingest`**, ingest a note titled `OpenBench Roundtrip Marker`
   whose body/insights include the exact `CLAWQL_ROUNDTRIP_TOKEN=…` line from that file.
3. If you have **`memory_recall`**, recall that token / title.
4. Write relative path `answer.json`:

```json
{
  "token": "<token value only, without the CLAWQL_ROUNDTRIP_TOKEN= prefix>",
  "source": "memory_recall"
}
```

## Rules

- Ignore `decoy/`.
- Passing requires **both** `memory_ingest` and `memory_recall` tool calls in this run
  (filesystem copy alone is not enough).
- Stop after writing `answer.json`.
