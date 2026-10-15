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
