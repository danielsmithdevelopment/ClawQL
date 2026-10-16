# Executor v1 stable vs v2 promoted (same Cloudflare board)

Measured: 2026-10-16T14:10:53Z · `ITERS=10000` · `REPS=3` · curated OpenAPI → replay mock.

| Cell | `executor_v2` (promoted beta) | `executor_v1` (stable 1.6.10) | `clawql_known_op` |
| --- | ---: | ---: | ---: |
| weighted_mean tokens | **5328** | **8236** | **1833** |
| task_success | 1.0 | 1.0 | 1.0 |
| session p50 ms | ~216 (rep4) | **~84** | — |
| anon MB median | **2103** (rep4 tree) | **~535** (mcp+daemon) | **121** (rep4) |
| HTTP concurrency | 2 / 10 / 22 @100/250/500 ms | **N/A** (stdio) | Bun 82 @100 ms |

## Takeaways

1. **v2 stays the main Executor column** — product currently promotes it.
2. **v1 is not a free pass on tokens** — stable is *worse* on weighted_mean (pretty-print + longer tool paths).
3. **v1 wins memory and session latency** on this board — honest split; ClawQL still leads both Executor versions on tokens and memory.
4. **Do not mix topologies** — v1 HTTP concurrency stays out of the multiplex table.

Artifacts: `board-rep{1,2,3}-n10000.json`, `board-summary-n10000-r3.json`.
