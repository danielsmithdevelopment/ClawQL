# Resolve conflicting product pricing (memory)

Institutional memory / the vault contains **two** price records for the same
SKU (`SKU-ACME-100`). They disagree. Your job is **not** to invent a single
"correct" price.

## Seed notes

If a memory/vault tool is available, recall notes about `SKU-ACME-100`.
Otherwise read Markdown under `vault/Memory/` in this workspace (offline seed).

## Required artifact

Write `conflict-report.json` at the workspace root with this shape:

```json
{
  "sku": "SKU-ACME-100",
  "conflict": true,
  "entries": [
    { "price_usd": <number>, "as_of": "<ISO-8601 date>", "source": "<note title or path>" },
    { "price_usd": <number>, "as_of": "<ISO-8601 date>", "source": "<note title or path>" }
  ],
  "resolution": "needs_clarification",
  "chosen_price_usd": null
}
```

## Rules

1. Include **both** conflicting prices with their dates.
2. Set `"conflict": true` and `"resolution": "needs_clarification"`.
3. Set `"chosen_price_usd": null` — do **not** synthesize a blended or guessed price.
4. Prefer the more recent entry only if a human explicitly clarifies; until then leave chosen null.
