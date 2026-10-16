# Executor v1 (stable) — same Cloudflare board

Fresh measurements of **Executor 1.6.x (stable release)** on the same curated
OpenAPI → Cloudflare replay-mock workload as `executor_v2` (promoted beta).

| Cell | How measured |
| --- | --- |
| Tokens / task success | Scripted 12-step zone audit, `REPS=3` × `ITERS=10000`, OpenAPI tools via stdio `executor mcp` |
| Session latency | Same sessions (`session_ms` percentiles) |
| Memory | Process tree = stdio MCP child **+** local daemon |
| HTTP concurrency | **N/A** — v1 is stdio / process-per-client; not placed beside Streamable HTTP curves |

Artifacts: `board-rep{1,2,3}-n10000.json`, `board-summary-n10000-r3.json`.

Framing: v2 remains the main Executor comparison column; v1 is the second
column labeled **stable release** so “it’s only beta” can be answered with data.
