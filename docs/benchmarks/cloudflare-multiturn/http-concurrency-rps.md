# HTTP multiplex — requests per second (same session as Executor)

Artifact: [`http-concurrency-with-executor.json`](./http-concurrency-with-executor.json)  
Measured: 2026-10-16T01:33:46.967Z · REPS=3 · step window 3 s · Cloudflare DNS `tools/call`  
SLO for *client* ceiling: p99 ≤ 100 ms (RPS is observed at that point, not a separate SLO).

RPS = successful `tools/call` completions / step seconds (3.0). ClawQL = known-op `execute`+`where`; peers / Executor = same DNS list without server-side `where` (larger body).

## At each arm’s sustained client ceiling (p99 still ≤ 100 ms)

| Arm | Clients (rep range → median) | RPS at that ceiling (r1, r2, r3) | RPS median |
| --- | ---: | ---: | ---: |
| `clawql_bun_smol` | [81, 98] → **87** | 1870 @98 · 1650 @87 · 1718 @81 | **~1718** |
| `clawql_node_256` | [31, 31] → **31** | 677 · 676 · 598 | **676** |
| `agentgateway` | [32, 36] → **33** | 701 @33 · 745 @32 · 755 @36 | **~745** |
| `mcpjungle` | [35, 38] → **37** | 467 @35 · 467 @37 · 462 @38 | **467** |
| `executor_v2` | **2 to 3** (sustained 2; first break 3) | 58 · 52 · 52 @2 | **~52** (@2) |

Executor at n=3 (just over the p99 line): RPS **57 · 56 · 50** (median **56**) — same throughput plateau, p99 tippy.

## Single-client baseline (n=1) — median of 3 reps

| Arm | RPS @ 1 client | p99 @ 1 client (rep1) |
| --- | ---: | ---: |
| `clawql_bun_smol` | **510** | 3.8 ms |
| `clawql_node_256` | **281** | 8.1 ms |
| `agentgateway` | **236** | 5.5 ms |
| `mcpjungle` | **172** | 7.0 ms |
| `executor_v2` | **32** | 40 ms |

## Throughput vs clients (median RPS across reps)

Useful for the “plateau” story. Full per-n series are in the JSON `arms[].steps` / `refine`.

### Executor v2

| Clients | RPS median | Notes |
| ---: | ---: | --- |
| 1 | 32 | |
| 2 | 52 | last ok under p99≤100 |
| 3 | 56 | first break (p99 ~102–182) |
| 4 | 54 | flat |

Throughput rises ~1.6× from 1→2 clients, then stays ~50–58 while latency climbs.

### ClawQL Bun `--smol`

| Clients | RPS median |
| ---: | ---: |
| 1 | 510 |
| 2 | 1242 |
| 4 | 1520 |
| 8 | 1599 |
| 16 | 1847 |
| 32 | 1778 |
| 64 | 1745 |
| ~87 (sustained band) | ~1650–1870 |

### ClawQL Node 256

| Clients | RPS median |
| ---: | ---: |
| 1 | 281 |
| 2 | 450 |
| 4 | 526 |
| 8 | 575 |
| 16 | 642 |
| 31 | 676 |
| 32 | 652 (break) |

### MCPJungle

| Clients | RPS median |
| ---: | ---: |
| 1 | 172 |
| 2 | 319 |
| 4 | 447 |
| 8–38 | ~440–467 (flat early) |

### agentgateway

| Clients | RPS median |
| ---: | ---: |
| 1 | 236 |
| 2 | 438 |
| 4 | 699 |
| 8 | 821 |
| 16 | 791 |
| 32–36 | ~700–755 |

## Headline ratios (sustained-ceiling RPS medians)

| vs Executor @2 (~52 RPS) | × |
| --- | ---: |
| Bun @~87 | **~33×** |
| agentgateway @~33 | **~14×** |
| Node256 @31 | **~13×** |
| MCPJungle @~37 | **~9×** |

Do not mix these with the Cloudflare board’s *session* rates or the stdio process-per-client chaos board.
