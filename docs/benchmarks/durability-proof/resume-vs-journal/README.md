# Tier F — resume vs journal length

File-journal stand-in: measure resume wall time as program journal grows.

| Evidence | [`evidence.json`](./evidence.json)                        |
| -------- | --------------------------------------------------------- |
| Command  | `npm run benchmark:resume-vs-journal`                     |
| Env      | `DURABILITY_RESUME_JOURNAL_STEPS=10,50,200,500` (default) |

**Lab context (see `host` in evidence.json):** single host, local filesystem JSONL journal, **append + fsync per journaled call**.

**Honesty:** this is replay cost on that journal — not fleet lease failover (Tier C ~12s). Report as **measured up to 500 steps**. Prefer **snapshots not needed up to 500 steps** when `snapshotRecommended` is false — do not extrapolate.
