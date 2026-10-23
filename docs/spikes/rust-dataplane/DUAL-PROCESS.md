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

| Gate | Bar |
| --- | --- |
| Governance parity | Risk → IFC → mandate consume → WORM on Rust; `comparisonLabel=governance` |
| Differential | Zero mismatches on agreed suite vs TS |
| Density survives | Governed Rust still ≪ Bun (near half-Bun or better) |
| Latency | Effectively equal (do not claim “2× faster” from ~0.5 ms p50) |

## Phase B progress (this branch)

| Slice | Status |
| --- | --- |
| Risk + park/block | Done (`CLAWQL_DATAPLANE_GOVERNANCE=1`) |
| Session IFC | Done (default on) |
| SQLite mandate park / `resume` / atomic consume | Done (`pending.rs`, same `CONSUME_SQL`) |
| Process-WORM | Done for spike (`CLAWQL_WORM_ENABLED=1`, JSON dialect) |
| Postgres consume | Pending |
| CBOR WORM dialect + HTTP differential suite | Pending |
| Fair governed density board | Pending |

## Honesty

- Week-1 boards stay labeled **`fast-path-only`** until both arms run full governance.
- Do not claim “mathematically proven policy” until Verus + Accepted go (ADR 0016).
