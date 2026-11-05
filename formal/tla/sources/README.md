# Pending source proposals (TLA+)

`PendingSourceStatus.tla` — custom-source propose → operator approve/decline/expire.

| Config | `WeakSkipPending` | Expect |
| ------ | ----------------- | ------ |
| `PendingSourceStatus.cfg` | `FALSE` | **PASS** — approve only after propose |
| `PendingSourceStatusWeak.cfg` | `TRUE` | **COUNTEREXAMPLE** — approve without pending |

```bash
scripts/formal/run-pending-source-tlc.sh
```

Code: `packages/clawql-api/src/sources/pending-source-transition.ts` wired into
`propose-source-core.ts` (`commitApprovedSourceEffect` / expire path).
