# Dual-process ownership (week-2 decision)

**Status:** Accepted direction (2026-10-23). Density boards settled (~8× memory, latency effectively equal). Proceed with a **narrow** dual-process split — not a Rust rewrite of ClawQL.

## Ownership

| Surface | Owner | Notes |
| --- | --- | --- |
| Known-op `execute` hot path (catalog → risk → IFC → consume → upstream → where/fields → WORM) | **Rust `clawql-dataplane`** | Optional Cloud / density path |
| `search`, plugins, memory, programs, OAuth, payments, catalog **build**, ops HTTP | **TypeScript / Bun host** | Default single-process product |
| Policy evaluator long-term | **One implementation** | Prefer Rust+Verus once go; retire dual TS oracles over time (ADR 0016) |
| cellrt / ProgramCellDO | **Unchanged** | Out of scope for this spike |

## Deploy shapes

1. **Default (most installs):** Bun/TS only — tip lean ~130 MB, peers ~99–103 MB.
2. **Cloud density (optional):** Rust dataplane on the execute MCP URL; TS host for everything else (or TS forwards known-op execute to Rust).

## Phase B exit (before go/no-go)

| Gate | Bar | Status |
| --- | --- | --- |
| Governance parity | Risk → IFC → mandate consume → WORM on Rust; `comparisonLabel=governance` | **Met** |
| Differential | Zero mismatches on agreed suite vs TS | **Met** (`diff-governance-cf.sh`) |
| Density survives | Governed Rust still ≪ Bun (near half-Bun or better) | **Met** (~8.9×) |
| Latency | Effectively equal (do not claim “2× faster” from ~0.5 ms p50) | **Met** (p999 tied) |

## Phase B progress (this branch)

| Slice | Status |
| --- | --- |
| Risk + park/block | Done (`CLAWQL_DATAPLANE_GOVERNANCE=1`) |
| Session IFC | Done (default on) |
| SQLite mandate park / `resume` / atomic consume | Done (`pending.rs`, same `CONSUME_SQL`) |
| Process-WORM | Done (`CLAWQL_WORM_ENABLED=1`, default **CBOR**; `CLAWQL_WORM_DIALECT=json` legacy) |
| Postgres consume | Done (`pending_pg.rs`; integration when `CLAWQL_PENDING_DATABASE_URL` set) |
| Governance HTTP self-check | Done (`scripts/dataplane/diff-governance.sh`) |
| CBOR WORM dialect | Done (`cbor_canon.rs` + node golden hashes) |
| Bun vs Rust CF cross-diff | Done (`diff-governance-cf.sh` — allow / block / park) |
| Fair governed density board | Done (`week1-gov-cf-known-op.sh`, `comparisonLabel=governance`) |

**Harness note:** put `CLAWQL_HOME` on a real filesystem (`/tmp/…`); the artifacts FUSE store returns SQLite `disk I/O error` for pending/WORM WAL.

## Fair governed density (3×10k CF known-op)

| Arm | Plateau median | Call p50 | Call p999 | Errors |
| --- | --- | --- | --- | --- |
| Bun lean | **~129 MB** | ~1.0 ms | ~5.0 ms | 0 |
| Rust dataplane (gov=1) | **~15.7 MB** | ~0.53 ms | ~5.3 ms | 0 |

Density ~**8×**; latency effectively equal at p999 (Phase C remasure). Source: `docs/benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json`. Spike decision: ADR 0016 **Accepted (conditional)**.

## Honesty

- Week-1 boards labeled **`fast-path-only`** remain the ungated cite; use **`governance`** for fair claims.
- Do not claim “mathematically proven policy” until Verus + Accepted go (ADR 0016).
- Do not claim “Rust 2× faster” from ~0.5 ms p50 gaps.
