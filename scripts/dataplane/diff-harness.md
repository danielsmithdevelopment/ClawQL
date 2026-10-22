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
