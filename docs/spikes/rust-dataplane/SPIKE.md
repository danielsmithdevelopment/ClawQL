# Rust data-plane spike — runbook

**ADR:** [0016](../../adr/0016-rust-dataplane-spike.md)  
**Bars:** [BARS.md](./BARS.md)  
**Code:** [`crates/clawql-dataplane/`](../../../crates/clawql-dataplane/)

## Status

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 0 Freeze | **Done** | Memory go bar = ≤65 MB anon; see BARS.md |
| A Bare path | **In progress** | SQLite catalog + Streamable HTTP JSON mode; no governance |
| B Governance | Pending | Week-2 candidate after week-1 memory gap |
| C Verus + boards | Pending | `policy.rs` is the first Verus candidate |
| D Go/no-go | Pending | |

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

**Bun tip note:** the Oct-15 ~130 MB Bun `--smol` cite is not reproducible on this tip (~170–260 MB on the same single-op probe). Full 10k board runs also show Bun Anonymous climbing (not a plateau); Rust stays flat ~16 MB.

## Differential harness

`scripts/dataplane/diff-harness.md` — expand after Streamable HTTP client parity is proven by week-1.
