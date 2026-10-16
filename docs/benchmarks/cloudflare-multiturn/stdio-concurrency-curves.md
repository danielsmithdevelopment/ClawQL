# Clients over stdio (one process per client)

Measured: 2026-10-16T16:28Z · REPS=3 · thresholds 100 / 250 / 500 ms p99 · Cloudflare DNS list (same call as HTTP curves).

**Topology (not HTTP multiplex):** each client owns one stdio MCP OS process.
- `clawql_known_op_stdio` — `node --max-old-space-size=256 dist/server.js`
- `executor_v1_stdio` — `executor mcp` → shared local daemon

Memory at each step = sum of all client process trees (+ Executor daemon once).
Do **not** put these cells beside the Streamable HTTP table.

Artifact: [`stdio-concurrency-curves.json`](./stdio-concurrency-curves.json)

## Clients at p99 cutoffs (median [min, max])

| Arm | @100 ms | @250 ms | @500 ms | Peak RPS (median) |
| --- | ---: | ---: | ---: | ---: |
| ClawQL known-op (stdio) | [30, 31] → **31** | [73, 79] → **74** | [119, 136] → **122** | **1145** |
| Executor v1 stable (stdio) | [5, 8] → **8** | [19, 24] → **19** | [31, 48] → **42** | **123** |

## Total anon MB at sustained client count (median)

| Arm | @100 ms | @250 ms | @500 ms |
| --- | ---: | ---: | ---: |
| ClawQL known-op (stdio) | **~3375** (@31) | **~7346** (@74) | **~10441** (@122) |
| Executor v1 stable (stdio) | **~2023** (@8) | **~4224** (@19) | **~7344** (@42) |

Single-client board memory (separate run): ClawQL HTTP known-op **~121 MB**; Executor v1 stdio **~535 MB** (mcp+daemon). Under stdio fan-out, memory scales roughly linearly with client count — the capacity story for v1 is as much about RAM as about p99.

## Takeaways

1. Same topology, ClawQL sustains **~4×** more clients than Executor v1 at 100 ms (31 vs 8) and **~3×** at 500 ms (122 vs 42).
2. Peak RPS: ClawQL **~1145** vs Executor v1 **~123** (~9×).
3. At equal client counts Executor v1 uses more total anon (daemon + heavier mcp children); at its lower sustained N it still burns multi-GB.
4. This table answers the beta objection on **capacity** in stdio; the HTTP table remains the multiplex comparison (v2 only).
