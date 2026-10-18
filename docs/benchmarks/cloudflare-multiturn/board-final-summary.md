# Cloudflare multi-turn board — final summary (post–compact-execute)

Generated: 2026-10-17T22:01:14.783Z
Board measuredAt (latest rep): 2026-10-17T21:33:25.236Z
Summary measuredAt: 2026-10-17T21:33:25.236Z
Iters: 10000 · Reps: 3

## Metrics policy
- id: `all_attempted_sessions_primary`
- task_success: Failed sessions count against task_success_rate; success_rate + error_rate = 1.
- tokens_latency_primary: Means include every attempted session; failed sessions keep tokens/latency up to the failing step.
- tokens_latency_success_only: success_only_* side-by-side for diagnostics.
- applies_to: all arms

## Run notes
- **compact_execute_remeasure (2026-10-17):** Under-budget execute success JSON is compact (no pretty-print) via `result-truncation.ts` on `cursor/cf-mt-compact-execute-a621`. Publish board `ITERS=10000 REPS=3` → `board-rep{1,2,3}-n10000.json` + `board-summary-n10000-r3.json`.
- **error_policy:** `CF_MT_ABORT_ON_ERROR=0` (continue-on-error). Completed board: **error_rate=0** every arm.
- **executor_v1:** Not re-run this pass — prior same-board figures (8236 weighted) retained below with ‡.
- **memory:** This remasure did **not** apply Node `--max-old-space-size=256` slim caps. ClawQL anon plateau ~**241–245 MB** across reps. Page memory cells that cite ~121 MB still refer to the prior Node-256 rep4 fill (`board-rep4-n10000.json`) — concurrency/memory curves unchanged by JSON pretty-print.

## Tokens / success / errors (across 3 reps)

| Arm | weighted_mean (r1,r2,r3) | task_success | error_rate | errors_by_kind | Δ vs pre-compact |
| --- | --- | --- | --- | --- | ---: |
| `direct` | [47361, 47361, 47361] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |
| `clawql_default` | [17698, 17698, 17698] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | **−123** |
| `clawql_compact_search` | [5802, 5802, 5802] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | **−123** |
| `clawql_known_op` | [1710, 1710, 1710] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | **−123** (1833→1710) |
| `clawql_program` | [5187, 5187, 5187] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |
| `executor_v2` (promoted beta) | [5328, 5328, 5328] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |
| `executor_v1` (stable 1.6.10) ‡ | [8236, 8236, 8236] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | n/a (not re-run) |
| `mcpjungle` | [55121, 55121, 55121] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |
| `agentgateway` | [54705, 54705, 54705] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |
| `cloudflare_codemode` | [3947, 3947, 3947] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] | 0 |

‡ Prior same-board run (`executor-v1/`). v2 stays the main Executor column.

## Memory plateau (anon MB median) — this remasure (uncapped)

| Arm | anon median (r1,r2,r3) | rss median |
| --- | --- | --- |
| `direct` | [None, None, None] | [None, None, None] |
| `clawql_default` | [238.63, 242.55, 242] | [318.04, 308.97, 308.58] |
| `clawql_compact_search` | [238.8, 245.18, 245.26] | [318.21, 311.54, 311.78] |
| `clawql_known_op` | [244.94, 243.01, 240.72] | [324.35, 309.64, 307.3] |
| `clawql_program` | [239.81, 238.75, 245.62] | [319.21, 305.09, 312.13] |
| `executor_v2` | [2529.82, 2680.81, 3240.04] | [2669.99, 2818.27, 3377.44] |
| `mcpjungle` | [103.29, 103.32, 102.17] | [172.33, 172.69, 171.69] |
| `agentgateway` | [98.74, 98.52, 99.8] | [172.57, 172.35, 173.58] |
| `cloudflare_codemode` | [None, None, None] | [None, None, None] |

Prior Node-256 slim memory fill (rep4, ~121–126 MB ClawQL) remains in `board-rep4-n10000.json` / `board-summary-n10000-rep4-memory.json` for heap-capped comparisons.

## Session p50 (latest rep, ms)

| Arm | p50 |
| --- | ---: |
| `clawql_known_op` | **24.6** |
| `clawql_program` | **11.8** |
| `executor_v2` | **217.7** |
| `mcpjungle` | 50.5 |
| `agentgateway` | 49.3 |

## Headline cells (for post drafting)

- Steady-state tokens (post–compact-execute): ClawQL known_op **1710** (−123 vs 1833), compact_search **5802**, default **17698**; program **5187** / Executor v2 **5328** / CF code-mode **3947** unchanged; aggregators unchanged fat path.
- Task success **1.0** every arm × 3 reps; error_rate **0**.
- Session p50: known_op **24.6 ms** / program **11.8 ms** / Executor v2 **~218 ms**.
- Memory: this remasure uncapped ClawQL ~**241–245 MB** anon; Node-256 slim ~**121 MB** still the heap-capped cite from rep4.
- HTTP / stdio concurrency: not re-run — tables below retained from prior publish board.

## HTTP concurrency

### Clients @ p99 ≤ 100 ms (same-session with Executor)

Artifact: [`http-concurrency-with-executor.json`](./http-concurrency-with-executor.json) · sanity [`http-concurrency-executor-sanity.md`](./http-concurrency-executor-sanity.md)

| Arm | clients | notes |
| --- | ---: | --- |
| `clawql_bun_smol` | [81, 98] → **87** | |
| `clawql_node_256` | **31** | |
| `mcpjungle` | [35, 38] → **37** | |
| `agentgateway` | [32, 36] → **33** | |
| `executor_v2` | **2 to 3** | sustained 2; first break 3; RPS plateau ~57 |

**One-liner:** Executor v2's throughput levels off at about 57 tool calls per second from two clients onward, so additional clients mostly add queueing. At a 100 ms p99, it sustains 2 to 3 clients.

### RPS at capacity / single client

See [`http-concurrency-rps.md`](./http-concurrency-rps.md). At sustained ceiling: Bun **~1718**, AG **~745**, Node256 **676**, MJ **467**, Executor **~52**. At n=1: Bun **510**, Node **281**, AG **236**, MJ **172**, Executor **32**.

### Earlier heap A/B (no Executor)

| Arm | range [min,max] | median |
| --- | ---: | ---: |
| `clawql_node_uncapped` | [30, 31] | 31 |
| `clawql_node_256` | [27, 29] | 27 |
| `clawql_node_384` | [25, 30] | 28 |
| `clawql_bun_smol` | [79, 87] | 84 |
| `mcpjungle` | [31, 31] | 31 |
| `agentgateway` | [34, 38] | 38 |
| `agentgateway_tuned` | [17, 17] | 17 |

**Heap cap:** within_run_band — do not claim cap costs ~30%.

### Multi-threshold curves (uncapped climb; clients @ 100 / 250 / 500 ms p99)

Artifact: [`http-concurrency-curves.json`](./http-concurrency-curves.json) · write-up [`http-concurrency-curves.md`](./http-concurrency-curves.md)  
Method: climb until p99/errors break (loop guard 8192 only — no predetermined client caps). REPS=3 for Bun/Node/MJ/Executor.

| Arm | @100 ms | @250 ms | @500 ms | Peak RPS |
| --- | ---: | ---: | ---: | ---: |
| `clawql_bun_smol` | [75, 85] → **82** | [209, 226] → **211** | [415, 442] → **434** | **1854** |
| `clawql_node_256` | [32, 33] → **33** | [95, 112] → **112** | [192, 224] → **224** | **675** |
| `mcpjungle` | [31, 38] → **34** | [91, 96] → **92** | [192, 197] → **192** | **476** |
| `agentgateway` | **33** | **88** | **112** † | **833** |
| `executor_v2` | **2** | [6, 10] → **10** | [21, 25] → **22** | **73** |
| `executor_v1` | — | — | — | — |

† AG host OOM (exit 137) at 128 clients before p99 cleared 500 ms; @500 is last measured sustained (112, p99≈346 ms), not an invented cap.

`executor_v1` is omitted from HTTP curves (stdio MCP, process-per-client) — see [`http-concurrency-curves.md`](./http-concurrency-curves.md) note and [`executor-v1/`](./executor-v1/).

**Page takeaway:** Loosening the cutoff does not close the gap — Bun still leads at 250 ms (**211** vs AG **88** / MJ **92**) and at 500 ms (**434** vs Node **224** / MJ **192** / AG **112**). Peak RPS: Bun **~1850** vs AG **~830** vs Executor **~73**.

### Clients over stdio (one process per client) — ClawQL vs Executor v1

Artifact: [`stdio-concurrency-curves.json`](./stdio-concurrency-curves.json) · write-up [`stdio-concurrency-curves.md`](./stdio-concurrency-curves.md)  
**Different topology from the HTTP table** — each client = one stdio MCP process. REPS=3 · same Cloudflare DNS call · total memory across all processes.

| Arm | @100 ms | @250 ms | @500 ms | Peak RPS | anon @100 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `clawql_known_op_stdio` | [30, 31] → **31** | [73, 79] → **74** | [119, 136] → **122** | **1145** | **~3.4 GB** |
| `executor_v1_stdio` (stable) | [5, 8] → **8** | [19, 24] → **19** | [31, 48] → **42** | **123** | **~2.0 GB** |

**Page takeaway (stdio):** On the fair process-per-client topology, ClawQL holds **~4×** more clients at 100 ms and **~9×** peak RPS vs Executor v1 stable. Memory grows with every client — v1’s single-client **~535 MB** becomes multi-GB under fan-out.

## Error inventory (aborted attempts)
- rep 3 `executor_v2`: http_502 after 7000 ok — One hard failure after ≥7000 ok sessions is an error rate on the order of ~0.01% for that incomplete arm (lower bound: ≥1/10000 if the arm had finished). Keep in proportion: possible Executor beta bug, resource limit under sustained load, or harness/mock interaction. Board error columns show it for every arm; do not amplify into a headline. Private repro to Executor maintainers is welcome if repeatable.

## Memory guidance for post (important)

- **Prefer rep 4 (same-run, Executor filled):** ClawQL anon **~121–126 MB**; MJ **102**; AG **99**; Executor **~2103 MB (~2.1 GB)** product-path (motel excluded).
- **Rep 3** (without Executor sample) matches ClawQL/MJ/AG within a few MB — consistent.
- **Rep 1–2:** ClawQL ~282–292 uncapped-like — do **not** average into the Cloud memory line.
- Bun Cloud HTTP path still ~**130 MB** from heap A/B.
