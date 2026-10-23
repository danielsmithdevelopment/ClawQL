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

## Phase B (governance) — done

| Slice | Rust | Diff vs TS |
| --- | --- | --- |
| HTTP risk allow/mandate/block | `risk.rs` + `CLAWQL_DATAPLANE_GOVERNANCE=1` | Method defaults match `classify-operation-risk` |
| Session IFC accumulate + write gate | `ifc.rs` (default on; `CLAWQL_ENABLE_SESSION_IFC=0` opt-out) | Lean fixture parity unit tests |
| Mandate park + consume (SQLite) | `pending.rs` + MCP `resume`; same `CONSUME_SQL` predicate | Unit tests + `diff-governance.sh` self-check |
| Mandate consume (Postgres) | `pending_pg.rs` (`CLAWQL_PENDING_DATABASE_URL`) | SQL shape unit tests; integration when URL set |
| Process-WORM audit | `worm.rs` + `cbor_canon.rs` (CBOR default) | Chain verify + node golden hashes |
| Bun CF cross-diff | — | `diff-governance-cf.sh` (allow / DELETE block / POST park) |
| Fair governed density | — | `week1-gov-cf-known-op.sh` → `docs/benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json` |

### Run

```bash
# Self-check (spawns dataplane with governance=1)
./scripts/dataplane/diff-governance.sh

# Bun vs Rust CF decision projection (spawns mock + both arms)
./scripts/dataplane/diff-governance-cf.sh

# Fair governed density board (GET known-ops; label=governance)
./scripts/dataplane/week1-gov-cf-known-op.sh
```

**Homes:** use `/tmp` for `CLAWQL_HOME` (scripts do this via `CF_DP_RUNTIME_DIR`); artifacts FUSE breaks SQLite WAL.

Ownership boundaries: [DUAL-PROCESS.md](../../docs/spikes/rust-dataplane/DUAL-PROCESS.md).
