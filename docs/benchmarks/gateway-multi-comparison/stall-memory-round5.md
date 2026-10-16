# Stall + Ready memory — round 5

Follow-up to [`stall-memory-round4.md`](./stall-memory-round4.md). Packaging answer: [`diagnostics-packaging.md`](./diagnostics-packaging.md).

## Packaging (user question)

**Neither `clawql-data` nor `clawql-analytics`.**

| Package | Role |
| --- | --- |
| `clawql-data` | DuckDB tier — keep **lazy** off Ready |
| `clawql-analytics` | Product analytics (PostHog) — not runtime stalls |
| `clawql-observability` | Production OTel / LGTM+ (#1192) — home for cheap always-on signals |
| *(new)* `clawql-diagnostics` | Optional — heavy opt-in hooks, lazy-loaded like `clawql-data` |
| `scripts/benchmarks/` | Bench-only probes (`MT_*`, strace, `--cpu-prof`) — never ship |

## CPU profile during stalls (`MT_HTTP_CPU_PROF=1`)

Board: [`gateway-multi-multiturn-clawql-http-cpuprof-2.5k.json`](./gateway-multi-multiturn-clawql-http-cpuprof-2.5k.json) (Node HTTP, n=2500 × 12-turn).  
Profile: `/opt/cursor/artifacts/cpu-prof-stall/CPU.20261013.070311.409706.0.001.cpuprofile` (~110 s, 100 653 samples). Summary: [`cpu-prof-stall-summary.json`](./cpu-prof-stall-summary.json).

### Board numbers (publish metric unchanged)

| Metric | Value |
| --- | ---: |
| flow e2e p999 | **392 ms** (client) |
| execute max | **401 ms** (client) / server log **332 ms** top |
| search max | **341 ms** (client) |
| slow flows overlapping GC/ELD | **0 / 11** |

### Confirmed in-handler execute (332 ms)

| Side | Observation |
| --- | --- |
| Client | 333.2 ms TTFB, `hold_ms=0`, `server_t0` ≈ client `t0` |
| Server | `[clawql-http-slow] 332.3ms … tool=execute` |
| CPU window (aligned ± filename epoch) | **~78% `(idle)`**, ~1% GC; remainder scattered (`scoreOperation`, CORS/router, `fetch`/`socketOnData`, zod) |

**Verdict:** the long in-handler execute is mostly **off-CPU wait** (libuv/I/O — consistent with `executeRestOperationImpl` → `node-fetch`), **not** a CPU-bound JS grind. Matches round-4 strace (long syscalls = `futex` only; no long `write`/`epoll_wait` on the stall path).

### Aggregate JS cost (whole run, non-idle)

When the isolate *is* running JS, the notable self-time contributors are:

| Frame | Approx self | Notes |
| --- | ---: | --- |
| `scoreOperation` / `searchOperations` | ~1.6–1.9% | Catalog scoring — search path |
| `executeRestOperationImpl` (+ fetch/http) | ~1.5%+ | Execute + upstream client |
| Effect runtime (`makePrimitiveProto`, `runLoop`, …) | ~1–2% combined | Orchestration overhead |
| `addSpanStackTrace` (Effect tracer) | ~0.7% | Span stack capture on search/execute |
| `writev` / HTTP write path | ~2% | Response serialization |
| `(garbage collector)` | ~2.8% | Process-wide; **not** correlated with slow flows |

Hot stacks under `executeRestOperationImpl` are dominated by **self time inside the impl** and **`node-fetch` / `http.ClientRequest`** — again pointing at upstream I/O, not scoring.

### Client-long / server-short anomalies (401 ms, 341 ms)

Two of the worst client POSTs (`401 ms` execute-sized body, `341 ms` search-sized body) show:

- `server_t0` present and ≈ client `t0`
- `server_ms=-` (headers already flushed — expected on Streamable HTTP)
- **no** matching `[clawql-http-slow]` ≥50 ms

`logSlowRoute` runs in the Express handler `finally` after `transport.handleRequest` resolves. So either those requests finished the awaited handle in &lt; `CLAWQL_HTTP_SLOW_MS`, with delay **after** that promise (flush / other event-loop work), or logging was missed. Treat as a **third class** to nail next: post-`handleRequest` delay vs silent log gap. Does **not** change publish p999 (still client e2e).

## What this rules in / out

| Hypothesis | Status |
| --- | --- |
| SSE hold-open | Still out (round 4; `hold_ms≈0`) |
| CPU-bound JS during 332 ms execute | **Out** for that stall (~78% idle) |
| Off-CPU wait inside execute (upstream/fetch) | **In** for the logged 332 ms stall |
| Pre-handler event-loop queue | Still in (round 4) |
| GC/ELD as stall cause | Still out (0 overlap) |

## Next probes (bench-only)

1. **Upstream timing** — log mock `/pets` accept→respond ms beside `[clawql-http-slow]` execute samples.
2. **`server_ms` even when headers flushed** — trailer or paired stderr field so client-long/server-short cases correlate without relying on `x-clawql-server-ms`.
3. Off-CPU / `perf` delayed-stack on a fuller host (gdb/eBPF still blocked in this image).

## Knobs

| Flag | Role |
| --- | --- |
| `MT_HTTP_CPU_PROF=1` | Node child `--cpu-prof` → `MT_HTTP_CPU_PROF_DIR` or `docs/…/cpu-prof` |
| `MT_STALL_DIAG=1` | Client + server slow pairing |
| Packaging map | [`diagnostics-packaging.md`](./diagnostics-packaging.md) |
