# Rust data-plane spike — runbook

**ADR:** [0016](../../adr/0016-rust-dataplane-spike.md)  
**Bars:** [BARS.md](./BARS.md)  
**Code:** [`crates/clawql-dataplane/`](../../../crates/clawql-dataplane/)

## Status

| Phase            | Status                                           | Notes                                                                                          |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 0 Freeze         | **Done**                                         | Memory go bar = ≤65 MB anon; see BARS.md                                                       |
| A Bare path      | **Done** (week-1 `fast-path-only`)               | SQLite catalog + Streamable HTTP JSON mode                                                     |
| B Governance     | **In progress**                                  | HTTP risk classify + park/block stub (`CLAWQL_DATAPLANE_GOVERNANCE=1`); IFC/consume/WORM next |
| C Verus + boards | Pending                                          | `policy.rs` is the first Verus candidate                                                       |
| D Go/no-go       | Pending                                          |                                                                                                |

## Honesty — do not quote idle toy RSS

Early smoke RSS on a release binary with a tiny self-mock catalog is **not** comparable to Bun’s lean-listen figure. Meaningful memory comparison: same **SQLite** catalog, same workload, memory at **plateau under load**, whole process.

## Catalog

Production schema from [`catalog-sqlite.ts`](../../../packages/clawql-api/src/catalog/catalog-sqlite.ts). Compile via `scripts/dataplane/compile-catalog-sqlite.mjs`. Env: `CLAWQL_CATALOG_SQLITE_PATH` / `CLAWQL_DATAPLANE_CATALOG`, `CLAWQL_API_BASE_URL`.

## Streamable HTTP

Sessionful `mcp-session-id`, dual `Accept`, JSON response mode, `notifications/initialized` → 202. Host also honors `CLAWQL_HTTP_SKIP_GRAPHQL=1` (equal-arm).

## Week-1 signal (fast path only)

```bash
CF_DP_REPS=3 CF_DP_ITERS=10000 ./scripts/dataplane/week1-cf-known-op.sh
```

See [WEEK1.md](./WEEK1.md). **Label: `fast-path-only`.**

**Bun tip note:** Oct-15 ~130 MB was a side-branch config cite. Tip after lazy-listen restore plateaus ~**139–142 MB** lean ([LEAN-BISECT](./LEAN-BISECT.md)). Post-lazy CF known-op board ([WEEK1-POST-PRUNE](./WEEK1-POST-PRUNE.md)): Bun **~129 MB** / Rust ~15 MB (~**8.4×**); lean density ~**9×**. Latency in-band (call p999 ~5–7 ms). GB climb was `_streamMapping` (fixed). HTTP 300–700 ms stalls remain ([HTTP-TAIL-POST-PRUNE](./HTTP-TAIL-POST-PRUNE.md)).
## Differential harness

`scripts/dataplane/diff-harness.md` — expand after Streamable HTTP client parity is proven by week-1.
