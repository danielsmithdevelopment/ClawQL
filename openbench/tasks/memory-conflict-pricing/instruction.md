# Memory conflict — pricing

The vault has **two** notes about **Acme Widget Pro** list price with different
`asOf` dates. They conflict. Do **not** invent a blended or “average” price.

## Steps

1. Call **`clawql_memory_recall`** with a query about Acme Widget Pro pricing
   (or similar). Prefer `maxDepth` ≥ 0 so both notes can be found.
2. From recall results, extract **both** prices and their dates.
3. Write relative path `conflict.json` that **flags the conflict** and lists both
   values. Do **not** pick a single winner unless you set `"chosen": null`.

## Artifact

```json
{
  "conflict": true,
  "values": [
    {"price": 42, "asOf": "2026-01-15"},
    {"price": 55, "asOf": "2026-06-01"}
  ],
  "chosen": null,
  "source": "memory_recall"
}
```

Order of `values` does not matter. Prices must be the integers **42** and **55**.

## Rules

- Ignore `decoy/`.
- Returning only one price, or a synthesized price like `48`, fails.
- Inventing `conflict.json` without a real `clawql_memory_recall` tool_use fails.
- Stop after writing `conflict.json`.
