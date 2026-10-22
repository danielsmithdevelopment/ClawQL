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

**Week-2 density (settled):** tip Bun after lazy-listen restore plateaus ~**130 MB** on the main line (lean ~139–142 MB; CF known-op confirmation ~129 MB) vs Rust ~15 MB — about **8–9×** ([LEAN-BISECT](./LEAN-BISECT.md), [WEEK1-POST-PRUNE](./WEEK1-POST-PRUNE.md)). Latency is **effectively equal** (median gap ~0.5 ms; do not cite “Rust 2× faster”). Publish cites need **3×10k with ranges**. Oct-15 ~130 MB was a side-branch-only config cite; tip now reproduces it. GB climb was `_streamMapping` (fixed). HTTP 300–700 ms stalls remain ([HTTP-TAIL-POST-PRUNE](./HTTP-TAIL-POST-PRUNE.md)). Next: Phase B governance on Rust, then fair full-work comparison.
## Differential harness

`scripts/dataplane/diff-harness.md` — expand after Streamable HTTP client parity is proven by week-1.
