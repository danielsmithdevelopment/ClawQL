# Executor v1 stable vs v2 promoted (same Cloudflare board)

Measured: 2026-10-16T14:10:53Z · `ITERS=10000` · `REPS=3` · curated OpenAPI → replay mock.

| Cell | `executor_v2` (promoted beta) | `executor_v1` (stable 1.6.10) | `clawql_known_op` |
| --- | ---: | ---: | ---: |
| weighted_mean tokens | **5328** | **8236** | **1833** |
| task_success | 1.0 | 1.0 | 1.0 |
| session p50 ms | **~216** (HTTP, rep4) | **~84** (**stdio**) | **23.8** (HTTP, board r3) |
| anon MB median | **2103** (rep4 tree) | **~535** (mcp+daemon) | **121** (rep4) |
| HTTP concurrency | 2 / 10 / 22 @100/250/500 ms | — (not HTTP) | Bun 82 @100 ms |
| Stdio concurrency @100 ms | — | **8** | **31** (stdio peer) |

## Takeaways

1. **v2 stays the main Executor column** — product currently promotes it.
2. **v1 is not a free pass on tokens** — stable is *worse* on weighted_mean (pretty-print + longer tool paths).
3. **v1 wins single-client memory vs v2** — honest split; ClawQL still leads both on tokens and memory.
4. **Stdio-vs-stdio concurrency** (fair capacity for v1): ClawQL **31** vs v1 **8** clients @100 ms; peak RPS **~1145** vs **~123**. See [`../stdio-concurrency-curves.md`](../stdio-concurrency-curves.md).
5. Do not compare v1’s 84 ms session p50 to ClawQL’s 23.8 ms without labeling transports (stdio vs HTTP).

Artifacts: `board-rep{1,2,3}-n10000.json`, `board-summary-n10000-r3.json`.
