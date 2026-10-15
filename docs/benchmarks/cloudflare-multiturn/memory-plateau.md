# CF multiturn memory — plateau, not start level

**Rep 1 (slim listen OOP+lazy, 2026-10-15):** every ClawQL arm, including
`clawql_known_op`, starts ~**75–87 MB** anonymous and plateaus ~**282–292 MB**.
The earlier **~112 MB** figure (120 known-op executes) was the **starting band**,
not steady state under sustained load.

| Arm (rep 1) | Anon first → last | Plateau median (RSS / anon / PSS) | Drift |
| --- | ---: | ---: | ---: |
| `clawql_default` | 86.7 → 287.6 | 338 / **288** / 291 | +201 |
| `clawql_compact_search` | 83.7 → 282.0 | 332 / **282** / 285 | +198 |
| `clawql_known_op` | 86.0 → 291.7 | 342 / **292** / 295 | +206 |
| `clawql_program` | 74.4 → 284.6 | 335 / **285** / 288 | +210 |
| MCPJungle (Go+REST) | 35.1 → 88.1 | 146 / **88** / 117 | +53 |
| agentgateway (gw+REST) | 37.7 → 97.2 | 166 / **98** / 134 | +59 |

**Same-run gaps at plateau:** ClawQL ~**290** anon vs MJ ~**88** (~**200 MB**)
and AG ~**98** (~**190 MB**). Still a large win vs the pre-slim board (~630 anon),
but not “within ~25 MB of a Go gateway.”

A plateau (not unbounded climb) usually means the runtime settled at a working
size — GC headroom / unreclaimed allocator space — not a classic leak. Confirm
with one measurement at plateau:

| Finding | Next step |
| --- | --- |
| Live JS heap small, anon ~290 | Heap-limit A/B (lower `--max-old-space-size` / Bun equivalent); report memory **and** latency |
| Live heap itself large | Diff early vs late heap snapshot by retained size |
| Gap is native (anon − heap) | `heaptrack` / maps attribution (as before) |

## Post line (honest)

> Starts near **80 MB**, settles near **290 MB** under sustained load, against
> about **90–100 MB** for the Go and Rust gateways (same-run tree anon).
> Down from ~**630 MB** before OOP catalog + lazy listen.

If a heap-limit A/B lowers the plateau without hurting latency, use that number.
If not, memory remains the board’s weak cell — say so plainly.

Artifact: [`board-rep1-n10000.json`](./board-rep1-n10000.json) (`memory_series` /
`memory_flatness`). Probe: `scripts/benchmarks/heap-vs-anon-plateau.mjs`.

## Heap vs anon at plateau (N=4000 known-op)

Artifact: [`heap-vs-anon-plateau-n4000.json`](./heap-vs-anon-plateau-n4000.json)

| Metric | Value |
| --- | ---: |
| Anon plateau median | **278.5 MB** |
| Live heap median | **130 MB** (series min/max **60–220**) |
| Anon − heap median | **~149 MB** |
| Execute latency p50 / p99 | **3.1 ms / 10.7 ms** |

When heap dips (~72 MB mid-run), anon stays ~**279 MB** — large unreclaimed /
native band beside a swinging live heap. Classification: **mixed** (not pure
tiny-heap headroom, not pure retained live).

## Old-space A/B (N=4000 known-op, same fixture)

| Arm | Anon plateau | Heap median | Anon−heap | p50 / p99 ms |
| --- | ---: | ---: | ---: | ---: |
| Default Node (no cap) | **278.5** | 130 | 149 | 3.1 / 10.7 |
| `--max-old-space-size=256` | **123.5** | 68 | 56 | 3.2 / 13.4 |

Artifacts: [`heap-vs-anon-plateau-n4000.json`](./heap-vs-anon-plateau-n4000.json),
[`heap-vs-anon-plateau-old256-n4000.json`](./heap-vs-anon-plateau-old256-n4000.json).

**~155 MB anon saved** for ~0.2 ms p50 / ~2.7 ms p99. Worth adopting as the
bench/product Node listen default. Re-run the CF 3×10k (or cite this A/B beside
the uncapped board) so the post can say ~**125 MB** plateau vs peers ~90–100,
not ~290.
