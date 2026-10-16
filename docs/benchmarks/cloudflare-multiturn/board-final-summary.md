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
| `executor_v2` | [5328, 5328, 5328] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `mcpjungle` | [55121, 55121, 55121] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `agentgateway` | [54705, 54705, 54705] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |
| `cloudflare_codemode` | [3947, 3947, 3947] | [1, 1, 1] | [0, 0, 0] | [{}, {}, {}] |

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

**Page memory cell (Executor):** about **2.1 GB** anonymous under load (same-run Node-256 board; product path). ClawQL **~121–126 MB**; MJ **102**; AG **99**.

**Executor check (rep4):** product-path anon sits in a **~1.9–2.4 GB** band after warmup (not a linear leak from zero); split ≈ **~0.8 GB native serve + ~1.2 GB sandbox + ~7 MB CLI** (motel excluded, grew separately). Detail: [`executor-memory-breakdown-rep4.md`](./executor-memory-breakdown-rep4.md).

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

**Heap cap:** within_run_band — do not claim cap costs ~30%. Multi-threshold curves (100/250/500) next: `CURVE=1` harness.

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

- Steady-state tokens: known_op / where path vs code-mode peers (weighted_mean table above).
- HTTP clients: Bun **87** vs Executor **2 to 3** vs MJ/AG **33–37**; lead capacity with saturation RPS where possible.
- Memory: ClawQL **~125 MB** vs MJ/AG **~100** vs Executor **~2.1 GB** (rep 4).
- Errors: report error_rate columns; keep Executor 502 in proportion if present.
- Weak cells: first-session cost vs code mode; HTTP tail open; program mode fan-out not yet boarded.

Artifacts: `board-rep{1,2,3,4}-n10000.json`, `board-summary-n10000-r3.json`, `board-summary-n10000-rep4-memory.json`, `board-error-inventory.json`, `http-concurrency-with-executor.json`, `http-concurrency-rps.md`.
