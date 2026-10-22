# Differential harness (Phase B stub)

Goal: same `execute` requests through Bun TypeScript host and `clawql-dataplane` produce the same decision + body (and later audit records).

## Planned layout

1. Export a fixture catalog from `loadSpec()` for one small provider (or mock).
2. Script: `scripts/dataplane/diff.sh` POSTs identical JSON-RPC `tools/call` / execute to:
   - `CLAWQL_TS_MCP_URL` (Bun host)
   - `CLAWQL_DP_MCP_URL` (dataplane)
3. Compare normalized JSON (strip `latencyMs`, timestamps).
4. Fuzz corpus for `where` expressions (shared with unit tests).

Phase A: unit tests in `where_filter.rs` + `policy.rs` only.
