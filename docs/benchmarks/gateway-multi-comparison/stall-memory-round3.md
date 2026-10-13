# Stall + catalog memory — round 3

Follow-up to [`stall-memory-round2.md`](./stall-memory-round2.md). Host-bound.

Enable: `MT_STALL_DIAG=1` (client slow log + GC observer + `CLAWQL_HTTP_TIMING` / `CLAWQL_HTTP_SLOW_MS` on the HTTP child).

## Stalls — server vs client

Artifacts: `gateway-multi-multiturn-clawql-http-srvcli-2k.json`, `/opt/cursor/artifacts/srvcli-node-2k.stderr.log`.

| Check | Result |
| --- | --- |
| Connection reuse | **`connects_total=1`** for the whole Node n=2000 arm (`undici` Agent `connections:1`, keep-alive). Not new-connection churn. |
| Client GC | 575 GC events; top **11 ms** — **does not** explain 100–300 ms stalls |
| Paired slows (client ≥50 ms) | **Mixed** |

Examples (Node HTTP, n=2000):

| Client ms | Server ms | Gap | Notes |
| ---: | ---: | ---: | --- |
| 127.7 | **126.4** | 1.3 | Real **server** stall (`tools/call` execute) |
| 80.9 | **80.1** | 0.8 | Real server stall |
| 319.9 | *(no ≥5 ms server log)* | — | `server_t0 == client t0` (handler entered immediately) → delay after/beside ClawQL handling (client schedule / response path) |
| 108.6 | *(no server log)* | — | Same pattern |
| 52.0 | 6.4 | **45.6** | Mostly **outside** server handler |

**Verdict:** Not a pure measurement artifact. Some tails are **inside ClawQL** (server duration ≈ client). Others have a clean/quick server with a large client gap — those are **client / transport completion**, not search/execute work. Fix both: keep hunting the server-side ~80–130 ms execute path, and treat client-only gaps as harness noise for publish p999 (or isolate with server_ms).

Bun n=1500 this session was quiet (flow p999 ~98 ms); use Node or longer interleaved boards to reproduce 500 ms-class spikes.

## Memory — lean vs fat at listen

Artifact: [`catalog-listen-rss.json`](./catalog-listen-rss.json) / `scripts/benchmarks/catalog-listen-rss-probe.mjs`.

| Catalog | Spec bytes | Listen RSS | Anon | Heap used |
| --- | ---: | ---: | ---: | ---: |
| Lean (40 minimal ops) | 3.2 KB | **233 MB** | 172 | 86 |
| Fat (equal-arm multiturn) | 53 KB | **280 MB** | 218 | 130 |
| **Delta** | +50 KB | **+47 MB** | +46 | +44 |

**Verdict:** Fat catalog costs ~**47 MB** at listen — real, but **not** the whole 155→280 story. Lean listen here is already **~233 MB** (earlier ~155 probe was a lighter/earlier snapshot). Spec JSON itself is tiny; the +47 MB is object graph / parser overhead around richer schemas, not “three copies of a huge document.” `rawSource` aliases `openapi` for OpenAPI loads (same reference). Lazy validators alone will not get fat under-load under 200 MB while lean listen is already ~230 MB on this host — need broader Ready slimming, then the ~47 MB catalog delta.

## Knobs

| Flag | Role |
| --- | --- |
| `MT_STALL_DIAG=1` | Client slow log + GC + server timing on HTTP children |
| `x-clawql-server-t0` | Set at POST handler entry (compare to client `t0`) |
| `[clawql-http-slow]` / `[mt-client-slow]` | Paired stderr lines with ISO timestamps |
