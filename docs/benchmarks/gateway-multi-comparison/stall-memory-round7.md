# Stall + Ready memory — round 7

Follow-up to [`stall-memory-round6.md`](./stall-memory-round6.md).

## 1. `http.server.request.start` → handler gap

Module: `src/http/mcp-http-parse-timing.ts` (diagnostics_channel). Logs / headers:

| Field | Meaning |
| --- | --- |
| `parse_t0` / `x-clawql-parse-t0` | When Node finished HTTP parse |
| `queue_ms` / `x-clawql-queue-ms` | Handler start − parse (Express `/mcp` entry) |
| `server_t0` | Existing handler-start stamp |

**How to read a slow client POST:**

| Pattern | Class |
| --- | --- |
| Large `queue_ms` | Event-loop backlog **before** handler (profile that window) |
| `parse_t0` ≫ client `t0`, `queue_ms` small | Delay **before** parse — client/socket send (or harness not writing) |
| `queue_ms`≈0, long `server` / upstream fetch | In-handler (or upstream wait) |

### Search CPU profile board (native fetch, n=3000)

Artifact: `gateway-multi-multiturn-clawql-http-search-cpuprof-3k.json`, profile under `/opt/cursor/artifacts/search-cpu-prof/`.

| Observation | Detail |
| --- | --- |
| Worst tools | **execute** max 467 ms; search max **172 ms** (warmup) |
| Long executes | `queue_ms≈0.2`; one sample `[clawql-upstream-fetch] headers_ms=438.5 backend=native` |
| Long client, short server (466 ms client / 12 ms server) | `queue_ms≈0.2`, `parse_t0≈server_t0≈client t0` — response not seen until ~450 ms after handler finished |
| Late parse example | client `t0` … **+164 ms** … `parse_t0` (send-side / harness), not handler queue |

**Harness coupling:** the equal-arm catalog mock **and** the undici client both run in the **multiturn parent** process. When that event loop is busy (GC, board work), the mock cannot accept/handle and the client cannot read — producing (a) long native/node-fetch waits with a “fast” mock handle once scheduled, and (b) client-long / server-short after ClawQL already wrote. This is a **bench artifact** affecting every arm that shares that mock; production ClawQL↔customer-upstream is separate processes.

## 2. Search profile (slow search window)

Around the 172 ms search sample: ~40% idle, ~4% GC, `scoreOperation` only ~1% self. Not a pure scoring grind — matches “waiting / other work” more than CPU-bound rank. Warmup search is the outlier; steady-state search p999 on this board was **~10 ms**.

## 3. Native fetch 10k matrix — **do not default**

Runner: `scripts/benchmarks/run-native-fetch-10k-matrix.mjs` → [`native-fetch-10k-matrix.json`](./native-fetch-10k-matrix.json).

| Run | flow p999 | RSS median | execute max | search max |
| --- | ---: | ---: | ---: | ---: |
| Node node-fetch control | **431** | 351 | 465 | 491 |
| Node native r1 / r2 / r3 | 479 / **402** / 478 | 344 / 346 / 342 | 477–539 | 489–843 |
| Bun native r1 / r2 / r3 | 376 / 467 / 547 | **298 / 295 / 297** | 497–543 | 498–558 |

**Verdict:** at full scale the n=1200 p999 win **does not hold**. Node native p999 mean **~453 ms** vs control **431 ms**; RSS median only ~7 MB better. Bun wins p50/p99 and under-load RSS, not rare-tail p999. Keep **`CLAWQL_NATIVE_FETCH` opt-in** — do not flip the production default from this matrix. Rare tails remain dominated by harness event-loop coupling (mock+client in parent) and in-process search/execute work, not `node-fetch` stream churn.

## Knobs

| Flag | Role |
| --- | --- |
| `CLAWQL_HTTP_PARSE_TIMING=1` | Force parse stamps (also on with `CLAWQL_HTTP_TIMING` / slow) |
| `CLAWQL_NATIVE_FETCH=1` | Opt-in native fetch (pending default) |
| `MT_HTTP_CPU_PROF=1` | Node `--cpu-prof` on HTTP child |
