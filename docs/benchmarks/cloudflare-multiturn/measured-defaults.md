# Measured product defaults (filter workflow)

**Decision (2026-10-15):** ship what the Cloudflare zone-audit board and dual-model
gate actually proved. Program mode stays **alongside** `search` / `execute`, not
the core tool — until evidence says otherwise (below).

Related: [ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md) ·
[`SPEC.md`](./SPEC.md) · [`lazy-plugin-costs.md`](../gateway-multi-comparison/lazy-plugin-costs.md) ·
[`memory-plateau.md`](./memory-plateau.md)

## Two different questions (known-op ≠ program)

| Question | Answer when clear | Answer when not |
| --- | --- | --- |
| **Which operation?** | Known-op: call `execute` by `operationId` | Discovery: `search` (later: routed execute / Decide) — **not** a program |
| **How many ops per round trip?** | One → plain `execute` (+ optional `where`) | Several (fan-out, joins, pipelined reads) → `execute_program` |

| | One operation | Several operations |
| --- | --- | --- |
| **Operation known** | Known-op `execute` + `where` (**board winner**) | Program of known operations |
| **Operation unknown** | Search, then `execute` | Search, then a program |

A program does not supply knowledge of which tool to call. When the action is
unclear, what is missing is **discovery**, not a plan runner.

## What ships as the default path now

| Lever | Status | Evidence |
| --- | --- | --- |
| **SQLite catalog, OOP build** (`CLAWQL_CATALOG_SQLITE` on, `BUILD=oop`) | **Default on** | Spec-size RSS independent of OAS parse; board homes show `oop-build` → `LOAD=db` |
| **Lazy horizontal plugins** (require-on-flag; k8s dynamic import) | **Shipped** | Ready maps free of k8s/xenova/stripe when tiers off; first k8s import ~363 ms; fail-closed |
| **Server-side `where`** + examples in tool schema + fix-named `where_invalid` | **Default product** | Scripted known-op **1743** weighted; dual-model gate win vs Executor |
| **Observation budget** (`totalCount` in truncated list notes; `full:true` opt-out) | **Default on** (~8k chars) | Stops blind models from eating ~60k DNS dumps |
| **Bun + `--smol`, ≥2 CPUs** | **Preferred deploy runtime** | Plateau ~**130 MB** anon; faster than uncapped Node at p50/p99/p999 — see heap table below |
| **Node `--max-old-space-size=256`** | **Lean Node default** | Caps plateau ~**132 MB**; costs ~**3.5 ms** at p99 vs uncapped |
| **Compact search** (`CLAWQL_SEARCH_COMPACT`) | **Labeled arm only** until routing eval clears it | Cuts first-session discovery; not product default yet |
| **Known-op reuse** (skills / memory → steady-state execute-by-id) | **Product intent** | Cheapest arm on this workflow |

**Flag:** `CLAWQL_ENABLE_PROGRAMS` stays **off** by default. When on, programs sit
beside `execute`; agents choose them for multi-call work.

## Heap limits by feature profile

Do **not** run memory ingest (or other heavy in-process features) on the lean 256 MB
Node setting. Pick the row that matches what the pod actually enables:

| Feature profile | What is on | Node `NODE_OPTIONS` / Helm `nodeOptions` | Bun | Notes |
| --- | --- | --- | --- | --- |
| **Lean listen** (search/execute, SQLite OOP, no vault memory, no documents, pack none) | Core MCP only | **`--max-old-space-size=256`** (Helm / kustomize base default) | **`--smol`** | Plateau ~**132 MB** (Node) / ~**130 MB** (Bun). No OOM on `full:true` / program fan-out. |
| **ClawQL Cloud / HTTP multiplex** (managed serving path) | Lean listen over Streamable HTTP | **256** on Node is fine for capacity (384 measured **same** 31 clients) | **`--smol` (Cloud default)** | Bun sustains **72** clients vs Node 31 / MJ 26 / AG 24 — see HTTP table. |
| **Memory-enabled** (`enableMemory` / vault ingest, embeddings rebuild) | + `memory_ingest` / recall | **`--max-old-space-size=384`** | `--smol` (raise host RAM if needed) | Long ingest (~305 KB doc) hit **~255–261 MB** anon under a 256 cap. **384 is for ingest headroom, not HTTP concurrency** (384 ≈ 256 clients). Do **not** run ingest on lean 256. |
| **Docker Desktop / all-providers demo** | memory + documents + large catalog | **768** (`values-docker-desktop.yaml`) | — | Catalog startup OOMs at 512. |
| **Heavy prod overlay** (kustomize `overlays/prod`) | site-specific | **3072** (existing overlay; leave unless remeasured) | — | Not the lean product claim. |

Helm lean default: `manifests/charts/clawql-mcp/values.yaml` →
`nodeOptions: "--max-old-space-size=256"`. Board harness:
`CLAWQL_NODE_MAX_OLD_SPACE_MB` defaults to **256** (`=0` uncapped).

### Heap A/B (N=4000 known-op) — interim until capped publish board

| Arm | Anon plateau | p50 / p99 / p999 ms | vs uncapped Node |
| --- | ---: | ---: | --- |
| Node uncapped | **296** | 2.9 / 9.8 / 17.3 | baseline |
| Node `--max-old-space-size=256` | **132** | 3.3 / **13.4** / 21.1 | −164 MB; **+3.5 ms p99**; +GC pauses |
| Bun `--smol` | **130** | **2.1 / 8.9 / 15.4** | −166 MB; **faster at every percentile** |

Same-run peers on the uncapped slim board: MCPJungle ~**88**, agentgateway ~**98**
anon. Capped/Bun gap vs those peers is about **35–45 MB** (132−88 / 130−98) — not “~30.”
**Prefer quoting plateau + peer gaps from the next publish board** (Node 256 default +
Bun arm), where memory series are same-run.

### HTTP concurrency (Cloud-shaped) — heap cap has a cost

Artifact: [`http-concurrency-heap-ab.json`](./http-concurrency-heap-ab.json)
(same host; p99 ≤ 100 ms; binary refine). ClawQL = known-op `execute`+`where`;
peers = same DNS op via `cf-rest-mcp` (no where → larger body).

| Arm | Sustained clients | First break |
| --- | ---: | ---: |
| Node uncapped | **44** | 45 |
| Node `--max-old-space-size=256` | **31** | 32 |
| Node `--max-old-space-size=384` | **31** | 32 |
| Bun `--smol` | **72** | 73 |
| MCPJungle (HTTP) | **26** | 27 |
| agentgateway (HTTP) | **24** | 25 |

**Heap cap vs concurrency:** uncapped **44 → 31** under 256 (~**30%** fewer clients).
Raising to **384 does not recover** clients (still **31**) — so 384 is not a Cloud
concurrency lever on this fixture; keep it for memory-ingest headroom. **Bun `--smol`**
is the Cloud HTTP default: **72** clients and ~130 MB plateau.

**Peers over HTTP (this workflow):** ClawQL moves answers (`where`); peers move full
DNS lists. Framing: fair, specific — not “peers are slower gateways.”

**Peer settings in this bench:** MCPJungle registered with `session_mode: stateful`
(keeps stdio `cf-rest-mcp` warm — better than the product default of a new upstream
connection per tool call). agentgateway left `workerThreads` /
`maxConcurrentRequests` / `poolMaxSize` at stock defaults. **Invite both maintainers**
to suggest production concurrency knobs before these numbers go public (same courtesy
as the token board).

### Reconcile the two concurrency boards (both valid)

| Board | Payload | Topology | MCPJungle sustained | ClawQL |
| --- | --- | --- | ---: | ---: |
| gateway-multi chaos-slim ([`gateway-multi-cmp-chaos-slim.json`](../gateway-multi-comparison/gateway-multi-cmp-chaos-slim.json)) | Tiny `list_pets` | MJ/AG: HTTP 1×; ClawQL: **stdio** process-per-client | **204** | **63** (stdio) |
| CF HTTP heap A/B ([`http-concurrency-heap-ab.json`](./http-concurrency-heap-ab.json)) | Cloudflare DNS lists (peers unfiltered; ClawQL `where`) | All arms: **HTTP multiplex** 1× | **26** | **72** (Bun) / **31** (Node 256) |

**204 and 26 are not contradictory** — different payloads (and ClawQL’s topology
differs on the pets board). State both when either number appears. NATS 4-replica
~**135** remains the near-term multi-instance capacity answer; the open HTTP tail
(300–700 ms stalls) is the same investigation as raising per-instance HTTP ceilings.

## Why program mode is not the core *yet*

On this filter workflow (scripted board):

| Arm | Weighted mean | Code mean |
| --- | ---: | ---: |
| `clawql_known_op` | **1743** | **191** (`where` args) |
| `clawql_program` | **5097** | **811** (plan JSON) |

Making today’s plan format the only path would make the common one-op case
~4× more expensive in code tokens (811 vs 191). Fan-out/join strength is still
unmeasured. The real-model headline gate was known-op vs Executor, not programs.
v0 is a declarative plan runner — not yet code in a celld isolate.

## Path to a single core tool (evidence-gated)

Instinct: a **one-step program should be just an `execute`**. If the program
format scales down so a one-step plan costs about the same as known-op args
(operation + arguments + `where`, no plan boilerplate), then program mode can
become the single surface: simple calls stay as cheap as today’s winner; complex
ones stay in the same tool.

**Promotion sequence:**

1. **Shrink one-step plans** toward `execute` size (target: code tokens ≈ known-op’s ~191 on this workflow).
2. **Rerun the Cloudflare 3×10k board** and the **pre-registered dual-model gate** — program must **match** known-op on the filter workflow.
3. **Build the fan-out / join board** — show where multi-step programs pull ahead (model turns + tokens).
4. Only then make program mode the core tool, with the same evidence standard that cleared known-op.
5. Keep ADR 0015 celld / isolation honesty gates before any “survives a crash” claim.

Until (1)–(2) hold, keep `execute` as the measured default for one-op work and
programs as the opt-in multi-op path.

## Post lines (Bun as Cloud default)

Three measured claims, same workflow family, each labeled for what it covers:

1. **Tokens (steady state):** fewest weighted tokens vs code-mode peers — dual-model
   gate, pre-registered (`known_op_beats_code_mode_for_real_models`).
2. **Memory:** Bun plateaus near **130 MB** under sustained load (Node 256 → **132 MB**
   at ~**3.5 ms** p99 cost vs uncapped).
3. **HTTP concurrency (this workflow):** Bun sustains **72** clients at p99 ≤ 100 ms
   vs MCPJungle **26** / agentgateway **24** — ClawQL moves answers (`where`), peers
   move full DNS lists. (Pets-board MJ **204** is a different, tiny payload.)

**Node lean (when Bun is not the runtime):**

> On Node with `--max-old-space-size=256`, ClawQL plateaus near **132 MB**, within about
> **35–45 MB** of the Go and Rust gateways, at about **3.5 ms** p99 versus uncapped —
> and holds **31** HTTP clients on this workflow (384 does not improve that).

Replace plateau/peer memory gaps with the next publish board’s same-run series when it
lands.
