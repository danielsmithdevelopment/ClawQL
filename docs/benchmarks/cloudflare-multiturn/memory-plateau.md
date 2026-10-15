# CF multiturn memory — plateau, not start level

**Rep 1 (slim listen OOP+lazy, uncapped Node, 2026-10-15):** every ClawQL arm, including
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

**Same-run gaps at plateau (uncapped):** ClawQL ~**290** anon vs MJ ~**88** (~**200 MB**)
and AG ~**98** (~**190 MB**). Still a large win vs the pre-slim board (~630 anon).

A plateau (not unbounded climb) usually means the runtime settled at a working
size — GC headroom / unreclaimed allocator space — not a classic leak.

## Old-space A/B (N=4000 known-op, TRACE_GC)

| Arm | Anon plateau | Heap median | p50 / p99 / p999 ms | GC pauses | GC pause sum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node uncapped | **296** | 108 | 2.9 / 9.8 / **17.3** | 244 | 698 ms |
| Node `--max-old-space-size=256` | **132** | 58 | 3.3 / **13.4** / **21.1** | 269 | 1059 ms |
| Bun default | **130** | 38 | 2.1 / 8.8 / 26.8 | — | — |
| Bun `--smol` | **130** | 37 | 2.1 / 8.9 / **15.4** | — | — |

Artifacts: [`heap-vs-anon-plateau-n4000.json`](./heap-vs-anon-plateau-n4000.json),
[`heap-vs-anon-plateau-old256-n4000.json`](./heap-vs-anon-plateau-old256-n4000.json),
[`heap-vs-anon-plateau-bun-n4000.json`](./heap-vs-anon-plateau-bun-n4000.json),
[`heap-vs-anon-plateau-bun-smol-n4000.json`](./heap-vs-anon-plateau-bun-smol-n4000.json).

**~165 MB anon saved** on Node for ~0.4 ms p50 / ~**3.5 ms p99** / ~3.8 ms p999, with
~10% more GC pauses and ~360 ms more pause time across the run. Bun already
plateaus near **130 MB**; `--smol` does not cut the plateau further but improves p999.

## Stress under the Node 256 cap

[`heap-cap-stress-node-old256.json`](./heap-cap-stress-node-old256.json) (no OOM / no crash):

| Case | Result | Anon |
| --- | --- | ---: |
| `full:true` DNS list (~160 KB, hard limit raised to 2 MB) | ok | 107 |
| Peak concurrency (single-instance multiplex) | sustained **128** | ~191 at N=128 |
| `memory_ingest` ~305 KB document | ok (tight) | **255** |
| 8-step `execute_program` fan-out | ok | 106 |

Bun `--smol` stress: same cases ok; long ingest anon ~**322** (Bun has no Node old-space flag).

**Product defaults:** Node lean listen **256**; memory-enabled / heavy catalog **384**
(ingest sat at the 256 ceiling); docker-desktop all-providers keep **768**. Bun deploy
with **`--smol`**. Recorded in [`measured-defaults.md`](./measured-defaults.md) and Helm
`nodeOptions`.

## Post line (capped)

> Plateaus near **125 MB** under sustained load, within about **30 MB** of the Go and
> Rust gateways, at a cost of about **3 ms** at p99. Down from ~**630 MB** before OOP
> catalog + lazy listen (uncapped slim board was ~**290 MB**).

The next publish 3×10k board defaults to `--max-old-space-size=256` (override
`CLAWQL_NODE_MAX_OLD_SPACE_MB=0` for uncapped). Quote the capped plateau from that
board when it lands; until then cite this A/B.

Artifact (uncapped board): [`board-rep1-n10000.json`](./board-rep1-n10000.json).
Probe: `scripts/benchmarks/heap-vs-anon-plateau.mjs`, `scripts/benchmarks/heap-cap-stress.mjs`.
