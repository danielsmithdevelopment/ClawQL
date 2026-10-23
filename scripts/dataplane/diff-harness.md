# Differential harness

Goal: same `execute` requests through Bun TypeScript host and `clawql-dataplane` produce the same decision + body (and later audit records).

## Shared inputs

- Same production `catalog.sqlite` (`CLAWQL_CATALOG_SQLITE_PATH` / `CLAWQL_DATAPLANE_CATALOG`)
- Same upstream (`CLAWQL_API_BASE_URL`)
- Streamable HTTP JSON mode + session headers (or stateless `2026-07-28`)

## Planned layout

1. Compile catalog: `scripts/dataplane/compile-catalog-sqlite.mjs`
2. `scripts/dataplane/diff.sh` POSTs identical JSON-RPC `tools/call` / execute to:
   - `CLAWQL_TS_MCP_URL` (Bun host)
   - `CLAWQL_DP_MCP_URL` (dataplane)
3. Compare normalized JSON (strip `latencyMs`, timestamps, `comparisonLabel`)
4. Fuzz corpus for `where` expressions

## Week-1 precursor

`scripts/dataplane/week1-cf-known-op.sh` — interleaved CF known-ops latency + memory plateau, labeled **`fast-path-only`** (no governance on Rust). Not a differential correctness suite.

## Phase B (governance) — in progress

| Slice | Rust | Diff vs TS |
| --- | --- | --- |
| HTTP risk allow/mandate/block | `risk.rs` + `CLAWQL_DATAPLANE_GOVERNANCE=1` | Method defaults match `classify-operation-risk` |
| Session IFC accumulate + write gate | `ifc.rs` (default on; `CLAWQL_ENABLE_SESSION_IFC=0` opt-out) | Lean fixture parity unit tests; full HTTP diff suite next |
| Mandate consume (Postgres) | stub park only | Pending |
| Process-WORM audit | — | Pending |

Ownership boundaries: [DUAL-PROCESS.md](./DUAL-PROCESS.md).
