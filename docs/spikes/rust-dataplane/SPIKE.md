# Rust data-plane spike — runbook

**ADR:** [0016](../../adr/0016-rust-dataplane-spike.md)  
**Bars:** [BARS.md](./BARS.md)  
**Code:** [`crates/clawql-dataplane/`](../../../crates/clawql-dataplane/)

## Status

| Phase            | Status                                           | Notes                                                                                          |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 0 Freeze         | **Done**                                         | Memory go bar = ≤65 MB anon; see BARS.md                                                       |
| A Bare path      | **Done** (week-1 `fast-path-only`)               | SQLite catalog + Streamable HTTP JSON mode                                                     |
| B Governance     | **Done (exit gates)**                            | Risk → IFC → mandate park/consume (**SQLite + Postgres**) + MCP `resume` → process-WORM (**CBOR** default) + `diff-governance.sh` / `diff-governance-cf.sh` (zero CF mismatches) + fair `week1-gov-cf-known-op.sh`. Ownership: [DUAL-PROCESS.md](./DUAL-PROCESS.md) |
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

**Week-2 density (settled):** tip Bun after lazy-listen restore plateaus ~**130 MB** on the main line. Publish CF known-op **3×10k**: Bun plateau **[124.4, 128.5]** med **124.5 MB** vs Rust **[15.5, 15.7]** med **15.6 MB** (~**8×**); lean ~139–142 MB (~9×). Latency **effectively equal** (p50 gap ~0.5 ms; p999 tied ~4.7–4.9 ms — do not cite “Rust 2× faster”). ([LEAN-BISECT](./LEAN-BISECT.md), [WEEK1-POST-PRUNE](./WEEK1-POST-PRUNE.md)). Oct-15 ~130 MB was a side-branch-only config cite; tip now reproduces it. GB climb was `_streamMapping` (fixed). HTTP 300–700 ms stalls remain ([HTTP-TAIL-POST-PRUNE](./HTTP-TAIL-POST-PRUNE.md)).

**Phase B fair board (`governance`):** same CF known-op **3×10k** with Rust `CLAWQL_DATAPLANE_GOVERNANCE=1` — Bun plateau med **130.2 MB** vs Rust **14.6 MB** (~**8.9×**); call p999 **4.72** vs **4.94 ms** (tied). Zero CF decision mismatches on `diff-governance-cf.sh`. Artifact: [`dataplane-week1-gov-3x10k.json`](../../benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json). Next: Phase C (Verus + remasure) / go-no-go.
## Differential harness

`scripts/dataplane/diff-harness.md` — expand after Streamable HTTP client parity is proven by week-1.
