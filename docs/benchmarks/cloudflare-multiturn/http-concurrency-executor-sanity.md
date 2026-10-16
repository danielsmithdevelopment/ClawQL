# Executor v2 HTTP concurrency — sanity check (2 to 3)

Artifact: [`http-concurrency-with-executor.json`](./http-concurrency-with-executor.json)  
RPS companion: [`http-concurrency-rps.md`](./http-concurrency-rps.md)  
Measured: 2026-10-16T01:33:46.967Z · REPS=3 · p99 ≤ 100 ms · error_rate ≤ 0.02 · **3 s** step window

**Verdict:** The ceiling holds as a real Executor property under HTTP multiplex, not a harness/auth/rate-limit artifact. Publish as **2 to 3** clients (sustained 2; first break at 3). Worth sending Rhys the config below before publish.

**Page one-liner:**

> Executor v2's throughput levels off at about 57 tool calls per second from two clients onward, so additional clients mostly add queueing. At a 100 ms p99, it sustains 2 to 3 clients.

## 1. Production configuration

| Check | Result |
| --- | --- |
| Package | npm `executor@2.0.0-beta.15` + `executor-linux-x64@2.0.0-beta.15-linux-x64` (published beta, not a local source checkout) |
| Command | `executor serve` only — `server.json`: `{"command":"executor serve","url":"http://127.0.0.1:4312","version":"2.0.0-beta.15"}` |
| Serve flags | No `--log-level debug/trace`; help exposes only log-level / wizard / completions |
| `workerd --debug-port` | Runtime control socket on the sandbox worker (same note as gateway-multi v2 boards) — not Chrome DevTools / “dev mode loaded” |
| Bench-only env | `EXECUTOR_NO_UPDATE_CHECK=1` (skips update check; does not change request handling) |
| Motel (diagnostics) | Separate workerd (`motel.capnp`) writing `diagnostics/executor-local.jsonl` with periodic `process.runtime` samples (~30 s). **Excluded from memory plateau.** Not the concurrency break cause. |

How users run it: same `executor serve` + Bearer API key + OpenAPI app deployed via `executor apps …` with `liveOpenapiRouter` → mock origin (host performs HTTP; QuickJS never needs fetch).

## 2. Same unit as every other arm

All arms in `http-concurrency-heap-ab.mjs` measure **individual Streamable HTTP `tools/call` latencies** over a 3 s window with N concurrent MCP sessions (4 warmups each). Break when p99 > 100 ms or error_rate > 0.02.

This is **not** whole 12-step session latency (that is the Cloudflare board’s `session_ms` column). Same call unit for ClawQL / MCPJungle / agentgateway / Executor.

## 3. Why it sits at 2 to 3 clients (throughput plateau)

All three reps: sustained **2**, first break at **3** (p99 102–182 ms). **Zero errors** on every step of every rep.

| Clients | Rep1 p50 / p99 (ms) | RPS | err |
| ---: | ---: | ---: | ---: |
| 1 | 27 / 40 | 35 | 0 |
| 2 | 31 / 79 | 58 | 0 |
| 3 | 50 / 102 | 57 | 0 |
| 4 | 70 / 138 | 54 | 0 |

Throughput rises from ~35 to ~58 calls/s from one client to two (~1.7×), then stays flat around **50–58** while median latency climbs. So there is *some* parallelism (about 1.7 calls’ worth); beyond two clients, extra load mostly becomes queueing. Do **not** claim hard single-lane “serializes every call” — the RPS table is the precise story.

### Why “2 to 3,” not bare “2”

At ~57 calls/s a 3 s window yields ~170 samples, so p99 is roughly the second-slowest call. Executor’s p99 sits on the threshold (79 ms at two clients, 102 at three). A longer step window (10–30 s) could tip either way; the publishable band is **2 to 3**. Against Bun’s 87 the conclusion is unchanged.

(Optional follow-up: remeasure Executor-only with `CONC_STEP_MS=15000` or `30000` when the host is quiet — after board-rep4 — if a single integer is preferred over the band.)

## 4. Errors during the test

Across all three reps, every ladder and refine step for `executor_v2` recorded `err: 0` / `error_rate: 0`. Breaks were **p99-only**.

## Config to send Rhys

```text
executor v2.0.0-beta.15 (npm optional platform package)
command: executor serve          # port 4312, Bearer API key
app:     OpenAPI tools via `executor apps deploy` + liveOpenapiRouter → replay mock
workload: MCP tools/call execute — DNS list filter in sandbox (same op as peers)
SLO:     p99 ≤ 100 ms on individual tool calls, N concurrent Streamable HTTP clients
result:  sustained 2 / first break 3 (3 reps); RPS plateau ~57 from n=2; 0 errors
note:    3 s step window → publish as 2 to 3; longer window welcome if you prefer
```

If he points at a concurrency / worker-pool setting we missed, rerun with it and publish the new range. If he confirms or does not respond, publish **2 to 3** with the throughput-plateau footnote.

**Do not confuse with** the earlier equal-arm **stdio process-per-client** chaos ceiling (~19–23 for Executor). Different topology.
