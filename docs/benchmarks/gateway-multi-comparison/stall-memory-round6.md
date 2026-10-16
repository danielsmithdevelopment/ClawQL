# Stall + Ready memory — round 6

Follow-up to [`stall-memory-round5.md`](./stall-memory-round5.md). Probe: ClawQL→catalog mock beside slow executes.

## Packaging (unchanged)

Still not `clawql-data` / `clawql-analytics` — see [`diagnostics-packaging.md`](./diagnostics-packaging.md). New signals stay behind env flags / harness.

## What we logged

| Side | Signal |
| --- | --- |
| Mock (`[mt-upstream]` / board `upstream_diagnostics`) | TCP connects, socket reuse, handle_ms, arrive_iso |
| ClawQL (`[clawql-upstream-fetch]`, `CLAWQL_UPSTREAM_FETCH_DIAG=1`) | issue_iso, headers_ms / body_ms / fetch_ms, backend, tcp_connects_* (agent path only) |
| Flags | `CLAWQL_NATIVE_FETCH=1`, `CLAWQL_UPSTREAM_KEEPALIVE=1` |

Summarizer: `scripts/benchmarks/summarize-upstream-stalls.mjs`.

## Board: node-fetch default (n=1200 HTTP)

Artifact: [`gateway-multi-multiturn-clawql-http-upstream-nodefetch-1.2k.json`](./gateway-multi-multiturn-clawql-http-upstream-nodefetch-1.2k.json).

| Upstream mock | Value |
| --- | ---: |
| requests | **14 400** (one execute REST hop per turn) |
| tcp_connects | **1** |
| new_socket_requests | **1** |
| reused_sockets | **14 399** |
| max_handle_ms | **2.6** |
| slow_top (≥5 ms handle) | **[]** |

**Read:** the mock receives promptly and handles in &lt;3 ms. Connection setup is **not** the stall — Node 22 `http.globalAgent.keepAlive === true`, so even bare `node-fetch` reuses the socket to this keep-alive mock.

| Publish / tool tails | Value |
| --- | ---: |
| flow e2e p999 | 361 ms |
| execute max | 135 ms (one ≥100 ms) |
| search max | **421 ms** (two ≥300 ms) |

### How the three-way split resolves (this host)

| Hypothesis | Result |
| --- | --- |
| Mock received late (ClawQL outbound / connect) | **Out** for the equal-arm catalog — 1 TCP / 14k requests; mock never slow |
| Mock handled slowly (harness GC) | **Out** — max handle 2.6 ms |
| ClawQL read response late after mock done | **Out** for logged upstream samples — `body_ms≈0`, `headers_ms` is the fetch wait |
| Long execute = long upstream fetch | **Out for the 130 ms execute** — no `[clawql-upstream-fetch]` ≥20 ms near it; mock max 2.6 ms. Time is **outside** the REST fetch (MCP/Effect/audit path around `execute`) |
| Long search = upstream | **N/A** — search never hits the mock; 311–420 ms client POSTs are search-sized (1410 B) with `server_t0`≈client `t0` but often **no** matching long `[clawql-http-slow]` (same client-long/server-short class as round 5) |

## `node-fetch` → native `fetch` (A/B, n=1200 each)

| Backend | flow p999 | execute max | search max | mock tcp_connects |
| --- | ---: | ---: | ---: | ---: |
| node-fetch (default) | 361 ms | 135 ms | 421 ms | 1 |
| `CLAWQL_NATIVE_FETCH=1` | **150 ms** | 110 ms | 126 ms | 1 |

Both reuse **one** TCP to the mock — so the p999 drop is **not** “fixed connect churn.” Possible residual benefit (less per-call overhead / event-loop pressure from `node-fetch`’s wrapper), but n=1200 is thin for rare multi-hundred-ms tails; re-run ≥5k before claiming a production win. Flag stays opt-in.

Artifacts: [`…-upstream-nodefetch-1.2k.json`](./gateway-multi-multiturn-clawql-http-upstream-nodefetch-1.2k.json), [`…-upstream-native-1.2k.json`](./gateway-multi-multiturn-clawql-http-upstream-native-1.2k.json).

## Next

1. **Search / pre-handler stalls** — CPU profile windowed on a search-sized client-long sample; `logSlowRoute` gap for client-long/server-short.
2. **In-handler execute without long fetch** — phase spans around Effect/`tools/call` execute (not just REST) when `server_ms` ≈ 100–400 and upstream fetch &lt;10 ms.
3. Optional: default `CLAWQL_NATIVE_FETCH` only after multi-host confirmation (not required to fix this mock board).
