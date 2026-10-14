# Gateway runtime sizing, fusion, Wasm, and catalog memory

Decisions from the equal-arm multiturn stall work ([`stall-memory-round8.md`](../benchmarks/gateway-multi-comparison/stall-memory-round8.md), [`stall-memory-round9.md`](../benchmarks/gateway-multi-comparison/stall-memory-round9.md)) and IDP memory pressure.

## 1. NATS / Redis do not fix a single-core JS tail

**No.** They solve different problems. On one core they make things slightly worse.

| They do not change | What they add on a 1-core pod |
| --- | --- |
| How many V8/JSC helper threads run | Another process competing for the same core |
| How those threads are scheduled | A network hop + serialization on a ~1.3 ms hot path |

**What NATS (already used) is for:**

- Spreading load across replicas (queue groups) — each replica on its own cores
- Moving shared state out of the process (sessions, caches, rate limits)
- Decoupling slow side work (events, audit fan-out) from the request path

**What actually addresses single-core tails:**

1. **Give each gateway process ≥2 CPUs** — fair bench layout and production minimum. Helm default `resources.limits.cpu: "2"`; do not set limit below 2 for latency-sensitive deploys ([`manifests/charts/clawql-mcp/values.yaml`](../../manifests/charts/clawql-mcp/values.yaml)).
2. **If something must run on one core**, reduce runtime background threading (Node `--single-threaded` / `--single-threaded-gc` via `MT_NODE_SINGLE_THREADED` in the harness — diagnosis only, not a production default).
3. **For more capacity**, run more replicas behind the NATS queue group, each with its own cores — that is where NATS helps.

Order: confirm with the 2-core bench → fix is **configuration and documentation**, not new infrastructure.

**Do not blame host noise for ClawQL HTTP-only spikes** when peers’ HTTP tails improved on the same machine. Next latency diagnostic is a **trivial echo through the same Streamable HTTP + Express stack** ([`stall-memory-round10.md`](../benchmarks/gateway-multi-comparison/stall-memory-round10.md)) before demoting HTTP p999 chase entirely.

## 2. Kernel fusion → ClawQL tool fusion

GPU kernel fusion removes launch overhead by batching work into one kernel. In an agent, the expensive “launch” is usually the **model turn** (seconds + re-read tokens), not the ~1 ms gateway hop. Fusing three tool calls into one can save two model turns — worth far more than gateway p999 work. That is why code / program mode exists ([ADR 0015](../adr/0015-program-mode-alongside-search-execute.md)).

| Fusion kind | ClawQL shape |
| --- | --- |
| Search into execute | `execute` with a description when routing is confident; else candidates (known-op without a prior ID) |
| Horizontal | Batched `execute` — several independent ops in one call, parallel on the server |
| Vertical | Dependent reads in one call (B uses a field from A) — program-mode references applied to reads |
| Arbitrary | Program mode — model-written program combining the above |

**Protocol:** MCP dropped JSON-RPC batching (June 2025). Batching lives **inside** ClawQL tools, not in the transport.

**Safety rule (already adopted):** a fused call must never see or do more than the same agent could with separate calls — per-op policy, risk, redaction, audit; writes still through proposals/mandates.

**Measure:** the current 12-turn board is sequential single ops — fusion cannot show up. Add tasks that need several lookups per step (joins, fan-out, chains) and count **model turns** as well as tokens and latency.

## 3. “Inline assembly” (Wasm / native) — when it helps

Possible via **WebAssembly** (Rust/Zig/C → Wasm; same on Node, Bun, Workers) or **native addons** (N-API / Bun FFI). On current profiles it would not move numbers much:

- Search scoring ~1% of a slow window
- In-handler stalls ~78% idle (waiting, not computing)
- Steady per-call ~1.3 ms, already level with Go/Rust peers
- Remaining rare tails are scheduling / runtime, not arithmetic

Crossing the boundary has copy/convert cost; for small ops it can be slower.

**Where it would matter later:** multi‑MB JSON parse/project; catalogs of thousands of tools; hot-path token counting; compact binary catalog layouts for memory (much of that last item is possible with typed arrays in TypeScript alone).

**Rule:** do not reach for Wasm until a profile shows a CPU-bound hot spot. Prefer core allocation, then compact catalog storage.

## 4. Catalog + IDP memory → colocated SQLite

**Shipped (default on):** `CLAWQL_CATALOG_SQLITE` (opt out `=0`) — Ready + under-load A/Bs in [`catalog-sqlite-underload.md`](../benchmarks/gateway-multi-comparison/catalog-sqlite-underload.md).

Keep hot indexes / working set in memory; leave cold OAS in a SQLite file next to ClawQL so Ready RSS scales with use, not with everything bundled.

**Why for bundled OpenAPI catalogs:**

- Most of the catalog is cold; JS object overhead is large vs compact rows
- OS page cache is reclaimable and **shared across replicas** on one host (PSS/anon matter more than raw RSS)
- Startup can skip parsing unused providers (`CLAWQL_CATALOG_SQLITE_LOAD=db`)
- Point reads stay microseconds (`node:sqlite` / Bun — no new npm dep)

**How (v1):**

1. Compile specs into read-only SQLite (`scripts/benchmarks/compile-catalog-sqlite.mjs` or listen-time persist): compact `Operation[]` JSON + gzip'd OpenAPI docs. Search stays the **existing** in-memory weighted keyword scan — **no** SQLite FTS/BM25 (#1186).
2. Slim `LoadedSpec`: ops hot; OAS materialised lazily on first property access.
3. Prefer SQLite for catalog cold storage; leave DuckDB to `clawql-data` analytics.
4. Keep hot mutable state in memory (audit ring, sessions).

**Measured (Sentry ~3.3 MB OpenAPI, 209 ops):** in-memory Ready **~292 MB** RSS → `LOAD=db` **~154 MB** (−138 MB RSS / −117 MB anon). Artifact: [`catalog-sqlite-rss-ab.json`](../benchmarks/gateway-multi-comparison/catalog-sqlite-rss-ab.json).

**Long Harvey-scale documents:** process in a **separate worker / celld cell**, page by page, writing chunks and page refs to SQLite as you go (“every fact keeps its source”). Bound concurrency so peak memory stays capped.

**Report honestly:** file-backed pages still count in RSS — publish **anonymous memory** and/or **PSS** alongside RSS so reclaimable/shared wins are visible.

## Related

- Helm resources: [`docs/deployment/helm.md`](../deployment/helm.md) · Cloud Run already defaults to 2 vCPU ([`deploy-cloud-run.md`](../deployment/deploy-cloud-run.md))
- Program / fusion: [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md)
- Buyer framing (realistic upstream): [`stall-memory-round9.md`](../benchmarks/gateway-multi-comparison/stall-memory-round9.md)
