# Week-1 signal — Cloudflare known-op (fast path only)

**Label: `fast-path-only`.** Rust Phase A has **no governance**. This is not the go/no-go comparison.

## Setup

- Shared production SQLite catalog (60 curated Cloudflare ops), `LOAD=db`
- Shared CF replay mock (`MT_UPSTREAM_LATENCY=0`)
- Bun: `bun --smol`, equal-arm instance spec (minimal base env), `CLAWQL_HTTP_SKIP_GRAPHQL=1` honored in host
- Rust: `clawql-dataplane` release, same catalog + base URL
- Lean probe: single DNS known-op (heap-vs-anon shape)
- Board: **3 × 10 000 sessions** × 11 steps, Bun↔Rust interleaved (30 000 sessions/arm)

Harness: `scripts/dataplane/week1-cf-known-op.sh`

## Bun memory honesty

| Measurement                                            | Anon                                       |
| ------------------------------------------------------ | ------------------------------------------ |
| Published cite (2026-10-15 heap-vs-anon Bun `--smol`)  | ~**130 MB**                                |
| This tip, same single-op lean probe (before 10k board) | ~**173 MB** (start ~105 MB)                |
| Tip **before** JSON `_streamMapping` prune             | **climbs ~200 → ~3444 MB** (not a plateau) |
| Tip **after** prune (PR #1390 / merged into Phase B)   | Climb fixed; remasure week-1 for plateau   |

The Oct-15 **130 MB** number is **not reproducible on this tip** under the published probe (lean floor ~170–260 MB is a **separate** open item). The GB-scale board climb was MCP SDK JSON `_streamMapping` retention — host prune + bound unit test land in [#1390](https://github.com/danielsmithdevelopment/ClawQL/pull/1390). Remasure Bun on this branch before quoting week-2 memory deltas.

## Results (10k × 3, 0 errors both arms)

| Arm            | per-call p50 / p99 / **p999** (ms) | session p99 / **p999** (ms) | Memory                                                     |
| -------------- | ---------------------------------- | --------------------------- | ---------------------------------------------------------- |
| Bun tip lean   | 1.12 / 3.61 / **9.75**             | 27.0 / **40.8**             | Lean-probe ~**173 MB**; board run **climbs** (not plateau) |
| Rust dataplane | 0.54 / 3.90 / **5.58**             | 20.1 / **37.6**             | **~15.7 MB flat**                                          |

Sessions/arm = 30 000 → p999 ≈ 30th-worst session (real tail sample).

## Reading

- **Memory:** vs tip lean-probe Bun (~173 MB), Rust ~15.7 MB is ~**11×**. vs the unreproducible 130 MB cite it would be ~9×. Bun also fails to hold a plateau under the 10k board — Rust does. Gap is large enough for week 2 even before governance.
- **Per-call p999:** ~1.7× (9.75 → 5.58 ms). Modest, matches “time wasn’t in CPU.”
- **Session p999:** similar (40.8 vs 37.6 ms) at this size — not a stall-vanishing story yet.
- **Go/no-go** still waits for Phase B (governance on both sides).

## Proceed

Week 2 (governance pipeline on Rust) is justified on the memory gap. Fix or explain the Bun board-run climb separately; do not inflate Rust’s win with Bun’s leak endpoint.
