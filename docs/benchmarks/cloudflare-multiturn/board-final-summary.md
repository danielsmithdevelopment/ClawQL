# Cloudflare multi-turn slim board — final summary

Generated: 2026-10-16T00:42:36.862941Z
Board measuredAt (latest rep): 2026-10-16T00:33:54.166Z
Summary measuredAt: 2026-10-16T00:33:55.917591Z
Iters: 10000 · Reps: 3

## Metrics policy
- id: `all_attempted_sessions_primary`
- task_success: Failed sessions count against task_success_rate; success_rate + error_rate = 1.
- tokens_latency_primary: Means include every attempted session; failed sessions keep tokens/latency up to the failing step.
- tokens_latency_success_only: success_only_* side-by-side for diagnostics.
- applies_to: all arms

## Run notes
- **rep3_restart:** Rep 3 was restarted after executor_v2 ToolCallFailed (HTTP 502) on step 10 (r2-list-buckets) aborted the first slim-board attempt around session 7000+ under the old fail-fast harness. See board-error-inventory.json. Restart uses continue-on-error so session failures increment error_rate instead of exiting. A later restart attempt failed harness-side (wrong EXECUTOR_BIN without `apps`); this run uses /tmp/executor-v2 CLI.
- **error_inventory:** board-error-inventory.json
- **rep1_rep2_error_policy:** fail-fast (completed arms imply recorded error_rate=0)
- **rep3_error_policy:** {'abort_on_error': False, 'note': 'Continue-on-error: failed sessions counted in error_rate / errors_by_kind.'}

## Tokens / success / errors (across 3 reps)

| Arm | weighted_mean (r1,r2,r3) | task_success | error_rate | errors_by_kind |
| --- | --- | --- | --- | --- |
| `direct` | [47361, 47361, 47361] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `clawql_default` | [17821, 17821, 17821] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `clawql_compact_search` | [5925, 5925, 5925] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `clawql_known_op` | [1833, 1833, 1833] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `clawql_program` | [5187, 5187, 5187] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `executor_v2` (promoted beta) | [5328, 5328, 5328] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `executor_v1` (stable 1.6.10) ‡ | [8236, 8236, 8236] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `mcpjungle` | [55121, 55121, 55121] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `agentgateway` | [54705, 54705, 54705] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `cloudflare_codemode` | [3947, 3947, 3947] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |

‡ Fresh same-board run (not old stdio inventory numbers). Artifacts: [`executor-v1/`](./executor-v1/). weighted_mean higher than v2 mainly from longer connection-scoped tool paths + stdio pretty-printed result text. v2 stays the main Executor column; v1 is the **stable release** second column.

## Memory plateau (anon MB median, when sampled)

### Reps 1–3 (original publish board; Executor not sampled)

| Arm | anon median (r1,r2,r3) | rss median |
| --- | --- | --- |
| `direct` | [None, None, None] | [None, None, None] |
| `clawql_default` | [287.64, 291.35, 125.3] | [337.85, 323.94, 176.1] |
| `clawql_compact_search` | [281.96, 285.83, 125.09] | [332.16, 318.37, 175.86] |
| `clawql_known_op` | [291.68, 291.97, 121.85] | [342.08, 325.09, 172.71] |
| `clawql_program` | [284.57, 290.6, 129] | [334.77, 323.15, 179.68] |
| `executor_v2` | [None, None, None] | [None, None, None] |
| `mcpjungle` | [88.13, 102.07, 103.01] | [146.34, 166.65, 173.61] |
| `agentgateway` | [97.97, 83.07, 98.92] | [166.26, 115.56, 170.24] |
| `cloudflare_codemode` | [None, None, None] | [None, None, None] |

### Rep 4 memory fill (2026-10-16T03:14:59Z) — Node 256, all arms, Executor tree sampled

Artifact: [`board-rep4-n10000.json`](./board-rep4-n10000.json) · summary [`board-summary-n10000-rep4-memory.json`](./board-summary-n10000-rep4-memory.json)  
Executor tree = CLI + native serve + sandbox workerd; **motel diagnostics excluded** from plateau. error_rate=0 every arm.

| Arm | anon MB median | rss MB median |
| --- | ---: | ---: |
| `clawql_known_op` | **121.12** | 172.02 |
| `clawql_compact_search` | **122.64** | 173.49 |
| `clawql_default` | **125.48** | 176.32 |
| `clawql_program` | **126.03** | 176.89 |
| `mcpjungle` | **102.14** | 172.60 |
| `agentgateway` | **98.73** | 169.73 |
| `executor_v2` | **2103** | 2194 |

**Page memory cell (Executor):** about **2.1 GB** under sustained load (same-run Node-256 board) — native serve about **0.8 GB** plus sandbox about **1.2 GB**, each process counted once; stock `executor serve` diagnostics (motel) **excluded** (generous to Executor). ClawQL **~121–126 MB**; MJ **102**; AG **99**. Detail: [`executor-memory-breakdown-rep4.md`](./executor-memory-breakdown-rep4.md).

### Executor v1 stable (same Cloudflare board; 2026-10-16)

Artifact: [`executor-v1/board-summary-n10000-r3.json`](./executor-v1/board-summary-n10000-r3.json) · tree = stdio `executor mcp` + daemon.

| Arm | weighted_mean | anon MB median | session p50 ms | transport | HTTP concurrency |
| --- | ---: | ---: | ---: | --- | --- |
| `executor_v2` (promoted) | **5328** | **2103** (rep4) | **~216** (rep4) | Streamable HTTP | **2–22** @100–500 ms |
| `executor_v1` (stable) | **8236** | **~535** (mcp+daemon) | **~84** | **stdio** MCP | see stdio table |
| `clawql_known_op` | **1833** | **121** (rep4) | **23.8** (board r3) | Streamable HTTP | Bun **82** @100 ms |
| `clawql_program` | **5187** | **126** (rep4) | **11.2** (board r3) | Streamable HTTP | — |

Do not compare v1's **84 ms** (stdio) to ClawQL's **23.8 ms** (HTTP) as same-transport latency. Stdio-vs-stdio concurrency: [`stdio-concurrency-curves.md`](./stdio-concurrency-curves.md).

**Framing:** v2 remains the headline Executor comparison. v1 on the identical mock workload is lighter on memory (~0.54 GB vs ~2.1 GB) and faster on its own transport, but heavier on tokens (8236 vs 5328). ClawQL leads both on tokens and memory. The stable release does **not** reverse the token story; the beta excuse does not rescue Executor on that cell.

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

## Errors (publish)

- Completed board (reps 1–3 and rep 4): **error_rate=0** on every arm, including `executor_v2`.
- Inventory still records the **aborted** first rep3 attempt (HTTP 502 after ≥7000 ok, ~0.01% order) — history, not the completed-board rate.

## Headline cells (for post drafting)

- Steady-state tokens: known_op / where path vs code-mode peers (weighted_mean table above). Executor **stable v1 = 8236**, promoted **v2 = 5328**, ClawQL known_op **1833** — same Cloudflare board.
- HTTP clients @100 ms: Bun **82** vs Executor v2 **2** vs MJ/AG **33–34**; at 500 ms Bun **434** vs Node **224** / MJ **192** / AG **112** / Executor v2 **22**. Peak RPS Bun **~1850**.
- Stdio clients @100 ms (process-per-client): ClawQL **31** vs Executor v1 stable **8**; peak RPS **~1145** vs **~123**. Separate table — not beside HTTP.
- Memory: ClawQL **~125 MB** vs MJ/AG **~100** vs Executor v2 **~2.1 GB** (rep 4) vs Executor v1 **~0.54 GB** single-client; stdio fan-out scales to multi-GB (see stdio table).
- Session p50 (label transport): ClawQL known_op **23.8 ms** / program **11.2 ms** (HTTP board); Executor v1 **~84 ms** (stdio); Executor v2 **~216 ms** (HTTP).
- Errors: report error_rate columns; keep Executor 502 in proportion if present.
- Weak cells: first-session cost vs code mode; HTTP tail open; program mode fan-out not yet boarded.

Artifacts: `board-rep{1,2,3,4}-n10000.json`, `board-summary-n10000-r3.json`, `board-summary-n10000-rep4-memory.json`, `board-error-inventory.json`, `http-concurrency-with-executor.json`, `http-concurrency-rps.md`, `http-concurrency-curves.json`, `http-concurrency-curves.md`.
