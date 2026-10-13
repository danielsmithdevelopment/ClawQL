# Stall + under-load memory — round 2

Follow-up to [`stall-memory-diagnostics.md`](./stall-memory-diagnostics.md). Host-bound.

## Stalls — off-thread wait hypotheses

| Test | Result |
| --- | --- |
| `UV_THREADPOOL_SIZE=16` (Node HTTP, n=800) | **No help** — flow p999 **239 → 265** ms; still rare ≥100 ms flows |
| `CLAWQL_TIMER_TRACE=1` (Bun, 30 flows, slow_ms=5) | Trace **installed**; **zero** timer callbacks ≥5 ms during the run |
| Host-lag / ELD (prior) | Already ruled out main-thread block |

**Verdict:** equal-length request stalls are still consistent with waiting on **off-thread I/O** (or Bun’s pool), but **not** libuv default pool saturation on Node, and **not** a slow `setInterval`/`setTimeout` body visible in this window. Next: wrap/await boundaries around upstream `fetch`/DNS (connect by IP + keep-alive already partly present) and Bun-specific pool metrics.

Artifacts: `gateway-multi-multiturn-clawql-http-uv-default-800.json`, `…-uv16-800.json`.

## Memory under load — not MCP session pileup

Harness already uses **one** warm Streamable HTTP session for all flows (`terminateSession` only on arm close).

| Probe | Result |
| --- | --- |
| `/healthz` `bench` (`CLAWQL_BENCH_STATS=1`) | **`mcp_sessions` stays 1** for the whole run; stream maps **0** after prune |
| Audit ring | Hits cap **64** quickly; with `CLAWQL_AUDIT_TOOL_CALLS=0` ring stays **0** and RSS **still** climbs |
| `terminateSession` | Sessions → 0; RSS drops only **~16 MB** (e.g. 323 → 307), **not** back to the ~155 MB lean Ready probe |
| `MT_HTTP_SESSION_PER_FLOW=1` | Recycle each flow — under-load RSS **same or worse** (~320 MB) |

Phase probe (`scripts/benchmarks/session-rss-phase-probe.mjs`): fat-catalog **listen ~283 MB** (sessions=0) → after connect ~285 → under load ~320 plateau. The lean Ready probe (~155 MB) is a **lighter schema graph**; equal-arm fat catalog residency alone explains most of 155 → ~280 before traffic.

**Node bench_series (uv-default 800):** after_connect **267 MB** → flow 1 **341 MB** (+74 MB on first traffic) → plateau **~345 MB**. Bounded retention is real; it is **process-global**, not session count.

**Verdict:** do **not** expect per-flow DELETE to hit the &lt;200 MB under-load target. Keep `CLAWQL_MCP_SESSION_IDLE_MS` for multi-client product hygiene. Next memory cut: defer/slim fat-catalog structures that appear at listen + first-flow caches (schema compile / search / undici), not session close.

## Knobs added

| Env / flag | Role |
| --- | --- |
| `CLAWQL_BENCH_STATS=1` | `/healthz` includes `bench` (sessions, stream maps, audit ring, rss) — harness default on |
| `CLAWQL_TIMER_TRACE=1` | Log slow timer callback durations |
| `CLAWQL_MCP_SESSION_IDLE_MS` | Idle-evict unused MCP sessions |
| `MT_HTTP_SESSION_PER_FLOW=1` | Harness: DELETE + re-init each flow (diagnostic) |
| `UV_THREADPOOL_SIZE` | Passed through to Node HTTP child |
