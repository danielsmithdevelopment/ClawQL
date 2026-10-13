# Stall + Ready memory — round 12

Follow-up to [`stall-memory-round11.md`](./stall-memory-round11.md). Time-boxed phase pass after variance check; then stop HTTP p999 hunting for publish.

## 1. Variance: round11’s “all_kill worse” was noise

Three reps each, gw2core, n=2500 (`http-layer-variance-3x.mjs`):

| Config | n≥300 ms range | p999 range (ms) |
| --- | ---: | ---: |
| `all_kill` | **4–5** | 336–445 |
| `board_default` | **5–5** | 356–406 |

**Verdict: `ranges_overlap`.** Do not read the single-pair 25 vs 4 as a layer effect. Artifact: [`http-layer-variance-3x.json`](./http-layer-variance-3x.json).

## 2. Upstream phase timing

Instrumentation: `diagnostics_channel` on `http.client.request.start` / `response.finish` (+ undici when native fetch), logged as `[clawql-upstream-phase]`. Mock `arrive`/`done` via `MT_UPSTREAM_TRACE=1`.

### What spike samples show (n=2500, full mock trace)

Mid-run stalls (flow 440 ≈335 ms, flow 1714 ≈376 ms):

| Check | Observation |
| --- | --- |
| Client → server handler start | **~1 ms** (`server_t0 ≈ client t0`, `queue_ms≈0.2`) |
| Mock arrive / handle (execute-sized RPC) | **arrive +2 ms, handle 0.1 ms** |
| Search-sized RPC (1411 B) | **no mock hit** (in-process search) |
| Client TTFB for that RPC | **226–296 ms** |
| `[clawql-upstream-fetch]` / phase on the stall | **absent** — fetch itself stays ≪20 ms |

So: **not write-late, not wire/mock-late.** The wait is **after** a fast upstream (or entirely inside search / MCP response), i.e. ClawQL post-fetch / tool-result / Streamable HTTP completion — not the outbound socket.

Confirmatory short board (`CLAWQL_UPSTREAM_PHASE=1`): when a fetch *is* logged, `write_delay_ms≈0.2`, `body_ms≈0.1`, `headers_wait_ms≈4` — fetch path healthy.

Artifacts: [`http-upstream-phase-2500.json`](./http-upstream-phase-2500.json), logs under `/opt/cursor/artifacts/http-upstream-phase-2500.stderr.log`.

### TCP_NODELAY

Not implicated: request reaches the mock within ~2 ms of client send on spike executes. `socket_nodelay` often unset on the node-fetch path before the socket is attached to the ClientRequest in the channel callback.

## 3. Ruled out (credible stop list)

| Suspect | Status |
| --- | --- |
| Host noise / need bigger machine | Ruled out (round 10 — peers improved) |
| Express + Streamable HTTP bare stack | Ruled out (`stack_clean` echo) |
| Auth cache / JWKS / KDF | Off on board (`noAuth`) |
| OTel batch export | Off on board |
| Budget / spend flush | Off on board |
| Audit / prune / ALS / auth middleware | Kill does not clear spikes (variance-stable) |
| Search-only | Execute-known still spikes (round 11) |
| Upstream write delay | Ruled out (handler start +1 ms) |
| Upstream wire / mock latency | Ruled out (mock ≤0.2 ms on spike executes) |
| Fetch body read | Ruled out when measured (`body_ms≈0.1`) |

**Still open:** rare post-mock / in-process MCP completion delays on ClawQL HTTP (search and execute), visible as client TTFB with a fast server-entry and fast mock. Not blocking the buyer token story.

## 4. Decision (time-box)

**No targeted fix this round** — the named remaining region is broad (tool result + Streamable HTTP completion), not a one-line cache/SWR change. Document the tail as **open**, keep phase kill-switches/diag for a later focused pass, and **move on to SQLite catalog / Ready-RSS work**.

## Harness / code shipped

- `packages/clawql-api/src/execute/upstream-client-phase.ts` + rest-operation wiring  
- `scripts/benchmarks/http-layer-variance-3x.mjs`  
- `scripts/benchmarks/summarize-upstream-phase.mjs`  
- Mock `done=` + `MT_UPSTREAM_TRACE`  
- `CLAWQL_UPSTREAM_PHASE=1` logs every execute’s phase breakdown  
