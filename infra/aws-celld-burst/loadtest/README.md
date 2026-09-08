# Three-arm load test scaffold (§13)

**Status:** Design only — does not run until Arm A/B/C ingest endpoints exist and AWS Cost Explorer tags are wired.

**Spec:** [`docs/streams/aws-celld-burst.md`](../../docs/streams/aws-celld-burst.md) §13

## Files

| Path | Purpose |
| ---- | ------- |
| `burst-1m-gap-2m.js` | k6 script: identical 1M / 10-min zero / 2M stream |
| `RESULT_TEMPLATE.md` | Publishable result template (§13.5) — fill after a real run |

## Usage (when arms exist)

```bash
# Arm A
BASE_URL=https://arm-a.example/webhook/burst \
  ARM=A \
  k6 run infra/aws-celld-burst/loadtest/burst-1m-gap-2m.js

# Repeat with ARM=B / ARM=C against their ingest URLs.
# Never publish until all three arms have same-day Cost Explorer exports.
```

## Honesty

Do not invent latency or dollar numbers from this scaffold. Unfavorable Arm B/C results must appear in the §13.5 template exactly as measured.
