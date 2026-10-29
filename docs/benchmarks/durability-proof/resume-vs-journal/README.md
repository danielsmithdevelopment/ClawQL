# Tier F — resume vs journal length

File-journal stand-in: measure resume wall time as program journal grows.

| Evidence | [`evidence.json`](./evidence.json)                        |
| -------- | --------------------------------------------------------- |
| Command  | `npm run benchmark:resume-vs-journal`                     |
| Env      | `DURABILITY_RESUME_JOURNAL_STEPS=10,50,200,500` (default) |

**Honesty:** this is replay cost on a local JSONL journal — not fleet lease failover (Tier C ~12s p50). Snapshots are recommended only when `snapshotRecommended` is true in the evidence.

Latest probe (file-journal): resume stays low single-digit ms through 500 steps (~0.01 ms/record). No snapshot work yet.
