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

## Old-space A/B (N=4000 known-op, TRACE_GC)

| Arm | Anon plateau | Heap median | p50 / p99 / p999 ms | GC pauses | GC pause sum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node uncapped | **296** | 108 | 2.9 / 9.8 / **17.3** | 244 | 698 ms |
| Node `--max-old-space-size=256` | **132** | 58 | 3.3 / **13.4** / **21.1** | 269 | 1059 ms |
| Bun default | **130** | 38 | 2.1 / 8.8 / 26.8 | — | — |
| Bun `--smol` | **130** | 37 | **2.1 / 8.9 / 15.4** | — | — |

Artifacts: [`heap-vs-anon-plateau-n4000.json`](./heap-vs-anon-plateau-n4000.json),
[`heap-vs-anon-plateau-old256-n4000.json`](./heap-vs-anon-plateau-old256-n4000.json),
[`heap-vs-anon-plateau-bun-n4000.json`](./heap-vs-anon-plateau-bun-n4000.json),
[`heap-vs-anon-plateau-bun-smol-n4000.json`](./heap-vs-anon-plateau-bun-smol-n4000.json).

**Node:** ~**164 MB** anon saved for ~0.4 ms p50 / ~**3.5 ms p99** / ~3.8 ms p999, with
~10% more GC pauses. **Bun `--smol`:** same ~**130 MB** plateau as capped Node, and
**faster than uncapped Node at every percentile** — memory savings with no latency tax.

Capped/Bun vs uncapped-board peers (MJ ~88 / AG ~98): about **35–45 MB**, not “~30.”
**Quote same-run peers from the next publish board** (defaults to Node 256).

## Stress under the Node 256 cap (OOM survival)

[`heap-cap-stress-node-old256.json`](./heap-cap-stress-node-old256.json) — no OOM / no crash:

| Case | Result |
| --- | --- |
| `full:true` DNS list (~160 KB) | ok (~105 MB anon) |
| HTTP multiplex concurrency | Survives high N; see SLO note below |
| `memory_ingest` ~305 KB document | ok but anon ~**255–261** → prefer **384** when memory is on |
| 8-step `execute_program` fan-out | ok |

### Concurrency — not a board doubling claim

An early stress pass reported “sustained 128” under Node 256. That run broke only on
error rate, **not** the gateway-multi SLO (**p99 ≤ 100 ms**, error rate ≤ 0.02).

Re-run with that SLO (HTTP multiplex, one ClawQL process — still **not** equal-arm
stdio chaos):

| Runtime | Sustained before break | First break |
| --- | ---: | --- |
| Node 256 | **16** | 32 (p99 ~224 ms) |
| Bun `--smol` | **32** | 64 (p99 ~101 ms) |

The published gateway-multi single-instance row remains ClawQL **63/64** vs MCPJungle
**204/205** (stdio equal-arm + refine). Do **not** claim a concurrency win from this
stress harness. Put equal-arm chaos on the next publish board.

## Heap limits by profile

See [`measured-defaults.md`](./measured-defaults.md): lean Node **256**, memory-enabled
**384**, docker-desktop all-providers **768**, Bun **`--smol`**.

## Post lines

**Preferred (Bun primary):**

> On Bun, ClawQL plateaus near **130 MB** under sustained load, within about **40 MB**
> of the Go and Rust gateways, and runs faster than uncapped Node.

**Node lean (state the tail cost):**

> On Node with `--max-old-space-size=256`, ClawQL plateaus near **132 MB** under
> sustained load, within about **35–45 MB** of the Go and Rust gateways, at a cost of
> about **3.5 ms** at p99. Down from ~**630 MB** before OOP catalog + lazy listen.

Take plateau + peer gaps from the next publish board when it lands.

Probes: `scripts/benchmarks/heap-vs-anon-plateau.mjs`,
`scripts/benchmarks/heap-cap-stress.mjs`. Uncapped board artifact:
[`board-rep1-n10000.json`](./board-rep1-n10000.json).
