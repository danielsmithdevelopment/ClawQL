# Rust data-plane spike — runbook

**ADR:** [0016](../../adr/0016-rust-dataplane-spike.md)  
**Bars:** [BARS.md](./BARS.md)  
**Code:** [`crates/clawql-dataplane/`](../../../crates/clawql-dataplane/)

## Status

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 0 Freeze | **Done** | Memory go bar = ≤65 MB anon; see BARS.md |
| A Bare path | **Done (scaffold)** | JSON catalog + minimal MCP + mock upstream; smoke green |
| B Governance | Pending | |
| C Verus + boards | Pending | `policy.rs` is the first Verus candidate |
| D Go/no-go | Pending | |

### Phase A smoke signal (local, self-mock)

Not a multiplex board — lean listen + 10× `execute` with JMESPath `where`:

| Build | VmRSS after warm execute |
| ----- | ------------------------ |
| debug | ~14 MB |
| **release** | **~6.7 MB** |

Bun lean baseline in BARS is ~125–130 MB. Release dataplane is already under the ≤65 MB go bar on this toy path; Phase B+ must re-check under governance + real catalog load before claiming the bar.

## Catalog honesty

ADR 0016 said “existing SQLite catalog.” In-tree today, OpenAPI ops load via `loadSpec()` into memory; a durable SQLite OOP catalog schema is not yet a stable public format. Phase A uses **JSON** (`CLAWQL_DATAPLANE_CATALOG`). Phase B should add a dump script from TypeScript → JSON/SQLite once the on-disk schema is pinned.

## Differential harness (stub)

`scripts/dataplane/diff-harness.md` — Phase B fills in request pairs against Bun host vs dataplane.
