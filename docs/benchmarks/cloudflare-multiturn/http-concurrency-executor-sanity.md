# Executor v2 HTTP concurrency — sanity check (median 2)

Artifact: [`http-concurrency-with-executor.json`](./http-concurrency-with-executor.json)  
Measured: 2026-10-16T01:33:46.967Z · REPS=3 · p99 ≤ 100 ms · error_rate ≤ 0.02

**Verdict:** The ceiling holds as a real Executor design property under this topology, not a harness/auth/rate-limit artifact. Safe to put on the page with a one-line explanation; worth sending Rhys the config below before publish.

## 1. Production configuration

| Check | Result |
| --- | --- |
| Package | npm `executor@2.0.0-beta.15` + `executor-linux-x64@2.0.0-beta.15-linux-x64` (published beta, not a local source checkout) |
| Command | `executor serve` only — `server.json`: `{"command":"executor serve","url":"http://127.0.0.1:4312","version":"2.0.0-beta.15"}` |
| Serve flags | No `--log-level debug/trace`; help exposes only log-level / wizard / completions |
| `workerd --debug-port` | Runtime control socket on the sandbox worker (same note as gateway-multi v2 boards) — not Chrome DevTools / “dev mode loaded” |
| Bench-only env | `EXECUTOR_NO_UPDATE_CHECK=1` (skips update check; does not change request handling) |
| Motel (diagnostics) | Separate workerd (`motel.capnp`) writing `diagnostics/executor-local.jsonl` with periodic `process.runtime` samples (~30 s). **Excluded from memory plateau.** During a 100-call burst, motel CPU was non-zero (telemetry may observe the host), but the concurrency break is explained by request serialization (below), not motel alone. |

How users run it: same `executor serve` + Bearer API key + OpenAPI app deployed via `executor apps …` with `liveOpenapiRouter` → mock origin (host performs HTTP; QuickJS never needs fetch).

## 2. Same unit as every other arm

All arms in `http-concurrency-heap-ab.mjs` measure **individual Streamable HTTP `tools/call` latencies** over a 3 s window with N concurrent MCP sessions (4 warmups each). Break when p99 > 100 ms or error_rate > 0.02.

This is **not** whole 12-step session latency (that is the Cloudflare board’s `session_ms` column). Same call unit for ClawQL / MCPJungle / agentgateway / Executor.

## 3. Why it saturates at 3 clients

Rep medians all sustained **2**, first break at **3** (p99 102–182 ms). **Zero errors** on every step of every rep.

| Clients | Rep1 p50 / p99 (ms) | RPS | err |
| ---: | ---: | ---: | ---: |
| 1 | 27 / 40 | 35 | 0 |
| 2 | 31 / 79 | 58 | 0 |
| 3 | 50 / 102 | 57 | 0 |
| 4 | 70 / 138 | 54 | 0 |

RPS plateaus from n=2 onward (~50–58) while p50 scales roughly with client count — classic single-lane queueing. Independent probe (4 parallel `execute` after per-client warmup):

- serial mean ≈ **31 ms**
- parallel-4 each ≈ **71–97 ms**, wall ≈ **97 ms** (wall ≈ max(each))
- errors: **0**

**Interpretation for the page (one line):** Executor’s code-mode `execute` path effectively serializes concurrent tool calls on one host, so under the same p99 ≤ 100 ms SLO it sustains 2 clients.

Not explained by: harness auth failures, rate-limit 429s, or mock timeouts (error_rate stayed 0; mock is shared and ClawQL/MJ/AG held 31–87 on the same mock in the same session).

**Do not confuse with** the earlier equal-arm **stdio process-per-client** chaos ceiling (~19–23 for Executor). That topology forks a process per client; this row is **HTTP multiplex** onto one `executor serve`.

## 4. Errors during the test

Across all three reps, every ladder and refine step for `executor_v2` recorded `err: 0` / `error_rate: 0`. Breaks were **p99-only**.

## Config to send Rhys

```text
executor v2.0.0-beta.15 (npm optional platform package)
command: executor serve          # port 4312, Bearer API key
app:     OpenAPI tools via `executor apps deploy` + liveOpenapiRouter → replay mock
workload: MCP tools/call execute — DNS list filter in sandbox (same op as peers)
SLO:     p99 ≤ 100 ms on individual tool calls, N concurrent Streamable HTTP clients
result:  sustained 2 / first break 3 (3 reps); 0 errors
```

If he points at a concurrency / worker-pool setting we missed, rerun with it and publish the new range. If he confirms or does not respond, publish 2 with the serialization footnote.
