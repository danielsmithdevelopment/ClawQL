# HTTP multiturn p999 — post-prune + Rust stall-control (2026-10-22)

**Question 1:** were ClawQL’s rare 300–700 ms HTTP flow stalls caused by orphan `_streamMapping` growth under sessionful JSON POSTs?

**Answer: no.** On the prune-fixed tip, the board still shows the same class of stalls (and more of them). Three remasures confirm the counts are stable, not run-to-run noise.

**Question 2:** if Rust over the same harness / client / mock shows zero ≥300 ms sessions while Bun and Node keep showing them, are the stalls in the TypeScript server path or its runtime?

**Answer: not proven.** Rust also shows ≥300 ms flows on every rep (fewer than TS; much healthier p999). Shared path (harness, client, mock, host) remains in the suspect set.

## Board

- Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs`
- Config: `MT_TURNS=12` `MT_ITERS=10000` `CATALOG_TOOL_COUNT=40` `MT_PIN_CORES=1`
- Arms: `clawql_http`, `clawql_http_bun`, `clawql_dataplane` (Rust execute-only; same catalog mock + MCP client)
- Artifacts: `stall-control-rep{1,2,3}-10k.json` under [`gateway-multi-comparison/`](../../benchmarks/gateway-multi-comparison/)

## Flow e2e — 3×10k (n≥300 ms)

| Arm | Rep1 n≥300 / p999 / max | Rep2 | Rep3 |
| --- | ---: | ---: | ---: |
| `clawql_http` (Node) | **19** / 517 ms / 561 ms | **19** / 532 ms / 573 ms | **18** / 513 ms / 571 ms |
| `clawql_http_bun` | **17** / 560 ms / 622 ms | **17** / 619 ms / 683 ms | **17** / 591 ms / 663 ms |
| `clawql_dataplane` (Rust) | **7** / 81 ms / 797 ms | **8** / 58 ms / 850 ms | **7** / 100 ms / 817 ms |

Pre-prune single board (for reference): Node 11 / Bun 7 ≥300 ms. Post-prune single board: Node 21 / Bun 17. The 3× series matches the post-prune band — treat the jump as **real and stable**, not variance from one noisy run.

Medians stay healthy (Node ~49 ms, Bun ~40 ms, Rust ~19 ms flow p50). Rust’s p999 is an order of magnitude cleaner; its rare stalls are still all on the execute path (no search) and often land in the 700–850 ms bucket.

## Implication

1. Closing `_streamMapping` does **not** close the HTTP p999 caveat.
2. Rust-as-control **does not** clear harness/client/mock/host — those remain live hypotheses.
3. TS arms still show ~2× the stall count of Rust on this board; amplification in the TS server path/runtime is still plausible, but not exclusive.

## Phase timing (one round, known-op, 2026-10-22)

Time-boxed localization with `MT_STALL_DIAG=1` `MT_UPSTREAM_DIAG=1` `MT_HTTP_TRACE_GC=1` on execute-only arms (`clawql_http_known`, `clawql_http_bun_known`, `clawql_dataplane`), n=10k, `MT_PIN_CORES=1`.

Artifact: [`stall-phases-known-10k.json`](../../benchmarks/gateway-multi-comparison/stall-phases-known-10k.json) (+ stderr under `/opt/cursor/artifacts/density-baseline/stall-phases/`).

| Arm | flow n≥300 / p999 / max | execute p50 / p999 |
| --- | ---: | ---: |
| Node known | **11** / 377 ms / 547 ms | 2.3 ms / 10.6 ms |
| Bun known | **10** / 327 ms / 610 ms | 1.8 ms / 7.1 ms |
| Rust dataplane | **8** / 132 ms / 772 ms | 1.5 ms / 5.1 ms |

### Shared floor (Rust’s ~8)

Paired `[mt-client-slow]` (≥300 ms) with Rust response headers on the same request:

| Signal | Result |
| --- | --- |
| `x-clawql-server-ms` | **~0.8–1.0 ms** |
| `x-clawql-upstream-ms` | **~0.4–0.6 ms** |
| `client_minus_server_ms` | **≈ full client stall** (500–700 ms) |
| Mock `max_handle_ms` | **18.6 ms** (entire run) |
| Node `--trace-gc` max pause | **~14 ms** |
| Client `PerformanceObserver` GC max | **~26 ms** |
| `[clawql-dataplane-slow]` max | **13 ms** (none ≥300) |

**Verdict:** the shared ~7–8 / 10k floor is a **harness / client / host transport gap**, not the mock, not GC, not Rust execute, not the upstream REST call. It slightly inflates every arm’s published tails; treat as board caveat, not a product execute regression.

### TypeScript extras

On this execute-only board, Node/Bun add only **~2–3** stalls over Rust (11/10 vs 8). Full search+execute boards (table above) add more — much of the earlier ~10 TS gap is the **search RPC**, not execute.

Ruled out for the ≥300 ms class on this round:

- **Collection pauses:** V8 scavenges ~1–2 ms; Mark-Compact ≤14 ms; zero slow flows overlapped a logged GC/ELD window.
- **Upstream fetch stack:** `[clawql-upstream-fetch]` max &lt;20 ms; mock handle ≤18.6 ms.

TS `x-clawql-server-ms` is often missing on Streamable JSON responses (headers flush before the Express finally hook), but `[clawql-http-slow]` never exceeded **27 ms** while clients still saw 300–500 ms TTFB with `server_t0 ≈ client t0` — same client/transport-gap shape as Rust.

**Stop here** (time-box). Density framing stands: latency dead heat at the median, ~9–10× lean RSS vs Rust (~142 MB Bun tip vs ~15 MB), board figure to remasure under restored lazy listen.

Related: climb fix [WEEK1-POST-PRUNE.md](./WEEK1-POST-PRUNE.md); lean floor restore [LEAN-BISECT.md](./LEAN-BISECT.md) / [memory-plateau.md](../../benchmarks/cloudflare-multiturn/memory-plateau.md).