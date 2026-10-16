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

## HTTP concurrency (p99≤100ms, REPS=3)

| Arm | range [min,max] | median |
| --- | ---: | ---: |
| `clawql_node_uncapped` | [30, 31] | 31 |
| `clawql_node_256` | [27, 29] | 27 |
| `clawql_node_384` | [25, 30] | 28 |
| `clawql_bun_smol` | [79, 87] | 84 |
| `mcpjungle` | [31, 31] | 31 |
| `agentgateway` | [34, 38] | 38 |
| `agentgateway_tuned` | [17, 17] | 17 |

**Heap cap:** within_run_band — prior single-pass uncapped 44 is an outlier; REPS=3 uncapped [31, 30, 31] [30,31], 256 [29, 27, 27] [27,29], 384 [30, 28, 25] [25,30]. 256 sits 1–4 clients under uncapped (not ~30%). 384 overlaps uncapped and should be unbound vs ~296 MB plateau — small flag/GC nudge possible, not a concurrency tax. Do not claim cap costs ~30%.

**Bun vs peers:** bun_holds_more — Bun [79,87] median 84 vs MJ [31,31] median 31 vs AG [34,38] median 38 (all REPS=3)

## Error inventory (aborted attempts)
- rep 3 `executor_v2`: http_502 after 7000 ok — One hard failure after ≥7000 ok sessions is an error rate on the order of ~0.01% for that incomplete arm (lower bound: ≥1/10000 if the arm had finished). Keep in proportion: possible Executor beta bug, resource limit under sustained load, or harness/mock interaction. Board error columns show it for every arm; do not amplify into a headline. Private repro to Executor maintainers is welcome if repeatable.

## Memory guidance for post (important)

- **Rep 3 (Node `--max-old-space-size=256`, publish default):** ClawQL anon medians **~122–129 MB** (known_op **121.85**, default **125.3**, program **129**). Peers same run: MCPJungle **103**, agentgateway **99**. Gap vs peers about **20–30 MB** on this board.
- **Rep 1–2:** ClawQL anon **~282–292 MB** (pre-restart slim pass; treat as uncapped-like / not the Node-256 product claim). Do **not** average r1–r3 for the Cloud memory line.
- **Quote for post:** prefer rep3 same-run figures, or the earlier heap A/B (Node 256 plateau **132 MB**, +3.5 ms p99) — label which artifact.
- Bun Cloud HTTP path still ~**130 MB** from heap A/B; HTTP concurrency Bun median **84**.

## Errors (publish)

- Completed board: **error_rate=0** on every arm across all three reps, including `executor_v2`.
- Inventory still records the **aborted** first rep3 attempt (HTTP 502 after ≥7000 ok, ~0.01% order) — history, not the completed-board rate.

## Headline cells (for post drafting)

- Steady-state tokens: known_op / where path vs code-mode peers (weighted_mean table above).
- HTTP clients/instance: Bun median from concurrency table; peers MJ/AG ranges.
- Memory: ClawQL anon medians vs MJ/AG from memory table (prefer same-run capped board when Node 256 default is on).
- Errors: report error_rate columns; keep Executor 502 in proportion if present.
- Weak cells to keep honest: first-session cost vs code mode; Go/Rust still leaner; HTTP tail open.

Artifacts: `board-rep{1,2,3}-n10000.json`, `board-summary-n10000-r3.json`, `board-error-inventory.json`, `http-concurrency-heap-ab.json`.
