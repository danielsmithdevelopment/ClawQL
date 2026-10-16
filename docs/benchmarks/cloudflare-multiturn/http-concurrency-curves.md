# HTTP concurrency multi-threshold curves
Measured: 2026-10-16T08:10:00Z
Uncapped climb until p99 or errors break (loop guard 8192 only). REPS=3 for ClawQL/MJ/Executor; Agentgateway 1 curve (host OOM blocked further high-n reps).

## Clients at p99 cutoffs (median [min, max])
| Arm | @100 ms | @250 ms | @500 ms | Peak RPS (median) |
| --- | ---: | ---: | ---: | ---: |
| ClawQL Bun --smol | [75, 85] → **82** | [209, 226] → **211** | [415, 442] → **434** | **1854** |
| ClawQL Node 256 | [32, 33] → **33** | [95, 112] → **112** | [192, 224] → **224** | **675** |
| MCPJungle | [31, 38] → **34** | [91, 96] → **92** | [192, 197] → **192** | **476** |
| Agentgateway † | **33** | **88** | **112** | **833** |
| Executor v2 | **2** | [6, 10] → **10** | [21, 25] → **22** | **72.6** |

† Agentgateway: host OOM (exit 137) at 128 clients before p99 cleared 500 ms; @500 = last sustained ladder point (112 clients, p99≈346 ms), not a predetermined cap. @100/@250 from completed refine.

## Per-rep detail
| Arm | rep | @100 | @250 | @500 | peak RPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `clawql_bun_smol` | 1 | 85 | 211 | 442 | 1854.4 |
| `clawql_node_256` | 1 | 33 | 112 | 224 | 677.1 |
| `mcpjungle` | 1 | 31 | 91 | 197 | 495.1 |
| `clawql_bun_smol` | 2 | 82 | 209 | 415 | 1884.9 |
| `clawql_node_256` | 2 | 32 | 112 | 224 | 675.4 |
| `mcpjungle` | 2 | 34 | 92 | 192 | 476.2 |
| `clawql_bun_smol` | 3 | 75 | 226 | 434 | 1781.3 |
| `clawql_node_256` | 3 | 33 | 95 | 192 | 668.2 |
| `mcpjungle` | 3 | 38 | 96 | 192 | 469.3 |
| `agentgateway` | 1 | 33 | 88 | 112 | 833.2 |
| `executor_v2` | 1 | 2 | 6 | 22 | 71.5 |
| `executor_v2` | 2 | 2 | 10 | 25 | 72.6 |
| `executor_v2` | 3 | 2 | 10 | 21 | 77.4 |

## Notes
- Same Streamable HTTP multiplex harness as prior concurrency A/B; per-call p99; error_rate break 0.02.
- ClawQL known-op + where; aggregators/Executor larger body (no where).
- Artifact: [`http-concurrency-curves.json`](./http-concurrency-curves.json)
