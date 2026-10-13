# Multi-gateway equal-arm comparison

Publish posture: **most efficient governed gateway** — claims only what holds under equal topology, equal task success, and an honest path matrix. Numbers below are host-bound; re-run on a dedicated bench host before external publish.

| Artifact | What it proves |
| --- | --- |
| [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) | Interleaved latency / gateway_cost / RSS (n=10 000) |
| [`gateway-multi-cmp-chaos-slim.json`](./gateway-multi-cmp-chaos-slim.json) | Chaos ceilings — **single-instance / stdio equal-arm** (not cross-topology) |
| [`gateway-multi-cmp-bun-10k.json`](./gateway-multi-cmp-bun-10k.json) | **Node vs Bun** same Core binary — Ready RSS / under-load RSS / latency (n=10 000) |
| [`gateway-multi-cmp-bun-chaos.json`](./gateway-multi-cmp-bun-chaos.json) | **Node vs Bun** chaos until-break (topology A) |
| [`gateway-multi-cmp-ts7-node-10k.json`](./gateway-multi-cmp-ts7-node-10k.json) | **TS7 + Node** ClawQL n=10k |
| [`gateway-multi-cmp-ts7-bun-10k.json`](./gateway-multi-cmp-ts7-bun-10k.json) | **TS7 + Bun** ClawQL n=10k |
| [`gateway-multi-cmp-ts7-node-chaos.json`](./gateway-multi-cmp-ts7-node-chaos.json) | **TS7 + Node** chaos until-break |
| [`gateway-multi-cmp-ts7-bun-chaos.json`](./gateway-multi-cmp-ts7-bun-chaos.json) | **TS7 + Bun** chaos until-break |
| [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json) | **12-turn I/O tokens + task success** on a fat catalog |
| [`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json) | Same board at N=24 (compounding check) |
| [`gateway-multi-multiturn-10k.json`](./gateway-multi-multiturn-10k.json) | **10 000 × 12-turn** flows — tokens + latency + RSS + task_success (+ **direct** baseline) |
| [`stall-memory-diagnostics.md`](./stall-memory-diagnostics.md) | Equal search/exec stall localization + smaps/DuckDB Ready breakdown |
| [`stall-memory-round2.md`](./stall-memory-round2.md) | UV pool / timer wrap / session-count — under-load RSS is not session pileup |
| [`stall-memory-round3.md`](./stall-memory-round3.md) | Server vs client stall timing + lean/fat catalog listen RSS |
| [`stall-memory-round4.md`](./stall-memory-round4.md) | TTFB vs complete; strace; publish p999 stays client e2e |
| [`stall-memory-round5.md`](./stall-memory-round5.md) | Packaging homes; `--cpu-prof` — in-handler execute is off-CPU wait |
| [`diagnostics-packaging.md`](./diagnostics-packaging.md) | Not `clawql-data` / `clawql-analytics` — harness vs OTel vs lazy diagnostics |
| [`cpu-prof-stall-summary.json`](./cpu-prof-stall-summary.json) | Parsed Node CPU profile around multiturn stalls |
| [`catalog-listen-rss.json`](./catalog-listen-rss.json) | Lean vs fat OpenAPI listen RSS / smaps |
| [`index.html`](./index.html) | Dedicated comparison page (competitors, Bun rationale, vs direct) |

---

## Category story (what we claim)

| Claim | Status | Bound |
| --- | --- | --- |
| **Fewest tokens among MCP aggregators + live Executor with equal task success** | **Primary** — classic Layer1-once + Σ Layer2 @12; all arms `task_success` PASS | ClawQL **20.5k** vs MCPJungle **35.3k** (1.72×) and Executor **53.7k** (2.61×). Layer 2 is the win — same gap as [Both Sides of Context Compression](https://pragmaticvectors.com/posts/both-sides-of-context-compression). |
| **Lowest governed gateway cost** | **Supported** on n=10k — ClawQL gateway_cost p50 **0.70 ms** vs Executor **2.36 ms** | Same equal-arm pets upstream contract |
| **Latency competitive with the fastest aggregators while doing more per call** | **Supported** — ClawQL best p50; MCPJungle best p999; essentially a tie at the top | Read with [path matrix](#path-matrix-what-each-arm-does) |
| **Scale-out concurrency win** | **Not claimed yet** | Only after same-topology boards (1-instance **and** 4-replica behind LB) for every arm, pushed until break |

Coherent publish line: **most efficient governed gateway** — output projection at the gateway layer (`fields`/`where`), which live Executor does not provide (measured full REST pass-through; see blog + `executor-cmp-001.live.json`).

Do **not** cite “135 vs 19” (ClawQL NATS 4-replica vs Executor process-per-client) as a same-board concurrency win.

---

## Path matrix (what each arm does)

Latency at n=10 000 is essentially a tie among the top three. ClawQL’s figure includes governance work the aggregators skip.

| Capability on the hot path | ClawQL (slim Core) | Executor | MCPJungle | agentgateway |
| --- | :---: | :---: | :---: | :---: |
| Auth / capability gate | ✓ (lifecycle off in bench; gate still present) | — | optional | optional |
| Operation risk / policy | ✓ (ALLOW_NO_ENFORCEMENT in bench) | — | — | — |
| Ephemeral audit ring | ✓ | — | — | — |
| Output redaction hooks | ✓ (available; unused on pets) | — | — | — |
| Result projection (`where`/`fields`) | ✓ (gateway-enforced) | ✗ (pass-through; no gateway projection) | — | — |
| Upstream HTTP to equal mock | ✓ | ✗ (sandbox; upstream=0) | ✓ | ✓ |
| Multi-tool catalog discovery | search (server-side) | N/A (code) | full `tools/list` | full `tools/list` |

At n=10 000: ClawQL fastest at **p50**; MCPJungle fastest at **p999**. That is the fair framing — not “ClawQL is always the lowest latency gateway.”

---

## Scorecard (honest)

| Dimension | Verdict |
| --- | --- |
| **Multi-turn I/O tokens (classic)** | **Lead** vs aggregators (~1.7× combined @12) and fat Executor (~2.6×). Re-list-every-turn is **secondary** (most clients cache `tools/list`; lazy clients shrink aggregator schema cost further). |
| **Task success** | Deterministic inventory checks in harness (`task_success`); LLM-as-judge optional when a model key is present. Publish only if ClawQL success ≥ peers. |
| **Latency e2e / gateway_cost** | **Win on governed cost**; e2e competitive (best p50, near-tie p999). |
| **Chaos (single-instance equal-arm)** | **Win vs Executor** — ClawQL **63/64** vs Executor **23/24**. **Loss vs MCPJungle** — **204/205**. **Tie vs agentgateway** — **62/63**. Do not claim aggregator concurrency wins. |
| **RSS** | **Loss among serious arms** — ClawQL cold Ready ~**232 MB**, chaos min ~**259 MB**, under-load median ~**427 MB** vs MCPJungle ~**148–152 MB**. Scale-out multiplies the gap. Admit it; profile heap before claiming memory wins. |
| **ContextForge / MetaMCP** | **Off the publish board.** ContextForge was previously nested behind MCPJungle (inflates latency/RSS/chaos). MetaMCP needs Docker. Re-add only with native REST/virtualization (CF → `/pets` direct) or a real MetaMCP run. |

---

## Equal-arm contract (latency)

| Lever | Normalization |
| --- | --- |
| Result | Same two-pet JSON (`Ada` / `Grace`) |
| Upstream | Shared mock HTTP `/pets` — ClawQL OpenAPI `execute` + aggregator `list_pets` via `EQUAL_ARM_UPSTREAM` |
| Executor | Static equal JSON in-sandbox (`fetch` disabled) — **upstream_cost = 0** |
| Composition | `CLAWQL_INSTANCE_SPEC` slim Core (memory/documents/ChatGPT off) — `ENABLE_*=0` alone is a no-op in 8.0 |
| Latency schedule | Interleaved closed-loop across live arms |
| Samples | **n = 10 000** (+ warmup 100) for trustworthy p999 |
| Gateway cost | `e2e − paired direct` when the arm paid the HTTP hop; Executor `gateway_cost ≈ e2e` |
| Tokens (primary) | **Invoked tool schema only**; full `tools/list` secondary |
| Chaos | Optional (`MULTI_SKIP_CHAOS=1` on the 10k latency run) |

## Board — n=10 000 interleaved (post composition slim)

| Arm | e2e p50 / p95 / p99 / **p999** (ms) | Gateway cost p50 / p99 / **p999** | RSS med MB | Tools | List tok | Invoked schema | Result tok |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **1.02 / 1.95 / 3.82 / 7.41** | **0.70 / 3.48 / 6.87** | 427† | **8** | **1189** | 178 | 59 |
| **Executor** | 2.36 / 5.12 / 6.61 / 11.49 | 2.36 / 6.61 / 11.49‡ | 210 | 7 | 2243 | 90 | 59 |
| **MCPJungle** | 1.34 / 2.72 / 4.36 / **6.86** | 1.02 / 3.99 / 6.52 | **152** | 1 | 46 | 46 | 28 |
| **agentgateway** | 1.17 / 2.38 / 4.21 / 7.29 | 0.84 / 3.81 / 6.87 | 215 | 1 | 37 | 37 | 28 |

† Under-load median; cold Ready ~232 MB / solo min ~255–259 MB. Heaviest serious arm — see RSS section.  
‡ Executor gateway_cost = e2e (upstream=0).

**Delta vs prior 10k (tools=18):** e2e p50 1.08→**1.02**, gateway_cost p50 0.81→**0.70**, p999 cost 9.41→**6.87**, tools 18→**8**, list tok 5334→**1189**.

---

## Chaos — topology rules

### What this board measures

| Topology | Arms | Artifact |
| --- | --- | --- |
| **A — Single instance / process-per-client** | ClawQL stdio, Executor stdio, MCPJungle 1× HTTP, agentgateway 1× HTTP | [`gateway-multi-cmp-chaos-slim.json`](./gateway-multi-cmp-chaos-slim.json) |
| **B — Scale-out (4 replicas behind LB)** | ClawQL NATS sticky (existing executor-cmp ceilings); MCPJungle / agentgateway **not yet on this board** | Separate — do not mix with A |

**Claim only within the same topology.** Push every arm until it **actually breaks** (`MULTI_CHAOS_UNTIL_BREAK=1`, raise `MULTI_CHAOS_MAX`). Stopping at 128 without a break is incomplete for concurrency claims.

### Board A — slim composition (p99≤100 ms), until-break

| Arm | Topology | last_ok / first_break | Break reason | RSS min / med (MB) |
| --- | --- | ---: | --- | ---: |
| **ClawQL** | stdio 1× | **63 / 64** | p99 106 ms | **259 / 342** |
| Executor | stdio 1× | 23 / 24 | p99 102 ms | 397 / 422 |
| MCPJungle | HTTP 1× | **204 / 205** | p99 112 ms | **97 / 97** |
| agentgateway | HTTP 1× | **62 / 63** | p99 111 ms | — |

On equal single-instance footing: **MCPJungle leads concurrency** (204); ClawQL ≈ agentgateway (~63); Executor trails (23). Publishable chaos claim on this board is **vs Executor only** (~2.7× clients) — not vs MCPJungle.

### Latency / chaos run

```bash
export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway

# Latency (no chaos)
MULTI_ITERS=10000 MULTI_WARMUP=100 MULTI_SKIP_CHAOS=1 MULTI_EQUAL_UPSTREAM=1 \
  MULTI_ARMS=clawql,executor,mcpjungle,agentgateway \
  MULTI_OUT=gateway-multi-cmp-10k.json \
  npm run benchmark:gateway-multi-comparison

# Chaos until break (single-instance)
MULTI_ITERS=100 MULTI_SKIP_CHAOS=0 MULTI_CHAOS_UNTIL_BREAK=1 MULTI_CHAOS_MAX=512 \
  MULTI_ARMS=clawql,executor,mcpjungle,agentgateway \
  MULTI_OUT=gateway-multi-cmp-chaos-slim.json \
  npm run benchmark:gateway-multi-comparison
```

---

## Dedicated page

Marketing landing (competitive matrix + scoreboards + video slot):

- [`apps/www/src/app/benchmarks/page.tsx`](../../../apps/www/src/app/benchmarks/page.tsx) → [clawql.com/benchmarks/](https://clawql.com/benchmarks/) after www Pages deploy merges
- Video embed: set `BENCHMARK_VIDEO_SRC` in `apps/www/src/lib/gateway-benchmarks.ts` to an R2/CDN URL (~84s / ~11 MB)

Shareable static board (competitors + fair direct baseline + Bun rationale):

- [`index.html`](./index.html) · ships under `apps/www/public/benchmarks/gateway-multi-comparison/` (live at [clawql.com/benchmarks/gateway-multi-comparison/](https://clawql.com/benchmarks/gateway-multi-comparison/) after www Pages deploy merges; prefer trailing slash)
- Docs mirror: `docs.clawql.com/benchmarks/gateway-multi-comparison` after docs deploy
- Regenerate: `npm run generate:gateway-multi-page`

## 12-step multiturn × 10 000 flows (tokens + latency + RSS)

Equal-arm fat catalog (40 tools). Each arm completes **10 000** full **12-turn** flows on one warm connection. Tokens from flow 1 (deterministic); latency/RSS/task_success over all turns/arm.

**Token model (rebuildable):** `combined @12 = definitions + Σ discovery + Σ results`.

**`direct`** = no MCP gateway — raw HTTP fat bodies **plus** catalog tool definitions once. When agentgateway is on the board, those definitions are **pinned to agentgateway’s `tools/list` serialization** of the same 40 ops (unwrapped republish) — that is why agentgateway matches the baseline exactly. MCPJungle’s +320 is exactly 5 840 − 5 520 (slightly more verbose wrapped schema text). Latency/RSS remain “no gateway process.”

Artifact: [`gateway-multi-multiturn-10k.json`](./gateway-multi-multiturn-10k.json) (smoke: [`gateway-multi-multiturn-direct-defs-smoke.json`](./gateway-multi-multiturn-direct-defs-smoke.json)).

| Arm | Definitions | Σ Discovery | Σ Results | Combined @12 | vs direct | Flow e2e p50 / **p999** (ms) | RSS med MB | Task success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Direct HTTP | 5 520† | 0 | 29 482 | **35 002** | baseline | **2.2 / 9.4** | — | **PASS** |
| **ClawQL (Node)** | **297** | **11 568** | **8 674** | **20 539** | **−14 463** | 18.2 / 56.8 | 678 | **PASS** |
| **ClawQL (Bun)** | **297** | **11 568** | **8 674** | **20 539** | **−14 463** | **15.0 / 35.0** | **337** | **PASS** |
| Executor | 90 | 0 | 53 578 | 53 668 | +18 666 | 64.4 / 106.6 | 213 | **PASS** |
| MCPJungle | 5 840 | 0 | 29 482 | 35 322 | +320 | 15.4 / 135.0 | **153** | **PASS** |
| agentgateway | 5 520 | 0 | 29 482 | **35 002** | **match** | **13.6** / 330.9 | 214 | **PASS** |

† Baseline defs = agentgateway’s serialization of the 40 catalog tools (exact match by construction).

ClawQL check: 297 + 11 568 + 8 674 = **20 539** (mean discovery 964/turn · mean result 723/turn). Aggregators **match** (or nearly match) the fair baseline — they do **not** add a separate “schema tax.” On **this board** ClawQL is the only measured arm that **reduces** tokens vs that baseline (~14.5k @12, ~41%) via projection. Bun keeps token wins and cuts Node multiturn RSS ~50%.

### Executor — same harness as always (version-scoped)

v1 and v2 both run through **`runExecutorArm` in `gateway-multi-multiturn.mjs`**: same fat `execute` fixture, discovery=0, same turns/iters/tokenizer. That is the equalization.

Executor **2 removed stdio MCP** (`executor mcp` prints: “Executor 1 command… Executor 2 serves MCP over HTTP”). Product transport differs; the **benchmark recipe does not**.

| Version | Product transport | Combined @12 | vs baseline | What changed |
| --- | --- | ---: | ---: | --- |
| **v1.6.10** | stdio (`executor mcp`) | **53 668** | **+18 666** | Pretty-print tax. Compacted would be ~29 572. |
| **v2.0.0-β.15** | HTTP `/mcp` only | **29 927** | **−5 075** | Compact envelopes. defs+envelope ≈ 445 over compact results. |

Credit the v2 fix. ClawQL (**20 539**) still leads v2 by **9 388** on tokens. Artifacts: [`executor-vs-mock-compare.json`](./executor-vs-mock-compare.json), [`gateway-multi-multiturn-executor-v2-equal-10k.json`](./gateway-multi-multiturn-executor-v2-equal-10k.json) (same harness as v1).

**Do not** compare v2 flow latency / RSS to ClawQL Bun stdio as same-topology — use the ClawQL HTTP rows below for same-transport latency peers.

### Publish board (one interleaved run) — share this table

Artifact: [`gateway-multi-multiturn-publish-all-arms-10k.json`](./gateway-multi-multiturn-publish-all-arms-10k.json) (`2026-10-12T23:27Z`). Every arm in **one** process. ClawQL runtime flags (even): Node `--max-old-space-size=512`, Bun `--smol` (`config.runtime_flags`).

| Arm | Combined @12 | RPCs/turn | ms/call p50 | Flow e2e p50 / **p999** | RSS med | Task |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Direct HTTP | **35 002** | 1 | 0.13 | **2.2 / 10.9** | — | PASS |
| ClawQL Node stdio | **20 539** | 2 | 0.56 | 15.2 / 42.5 | 373 | PASS |
| **ClawQL Bun stdio** | **20 539** | 2 | **0.35** | **9.6 / 25.7** | 342 | PASS |
| ClawQL Node HTTP | **20 539** | 2 | 1.68 | 41.6 / 443 | 366 | PASS |
| **ClawQL Bun HTTP** | **20 539** | 2 | **1.30** | **32.7 / 461** | **312** | PASS |
| ClawQL Node gRPC | 20 523† | 2 | 5.64 | 136.7 / 194 | 364 | PASS |
| ClawQL Bun gRPC | 20 523† | 2 | 5.55 | 134.1 / 292 | 438 | PASS |
| Executor v1.6.10 | 53 668 | 1 | 4.75 | 60.8 / 165 | 254 | PASS |
| Executor v2 β.15 | 29 927 | 1 | 5.55 | 70.6 / **136** | 900 | PASS |
| MCPJungle | 35 322 | 1 | **1.28** | 16.6 / 287 | **153** | PASS |
| agentgateway | **35 002** | 1 | **1.23** | 16.3 / 208 | 214 | PASS |

† gRPC Layer1 is −16 vs stdio/HTTP (281 vs 297): protobuf omits SDK `execution.taskSupport=forbidden` on search+execute — envelope-only.

**HTTP-to-HTTP (video / latency):** ClawQL Bun HTTP median **32.7 ms** ≈ **2.0×** agentgateway (16.3) and **~2.2×** faster than Executor v2 (70.6). Per-call: **1.30 ms** vs MCPJungle **1.28** / agentgateway **1.23**. p999 on this interleaved board trails the peers (461 vs 136–287) — do **not** claim “3×–9× tighter tail.” Claims that hold: **per-call overhead on par with Go/Rust** and **&gt;2× faster than Executor v2** on median.

**RPCs/turn:** ClawQL = 2 (search+execute); peers = 1. Session gap is mostly the second call — it buys ~41% token savings.

Older solo-arm JSON rows (HTTP p999 v1–v4, bun-smol10k, etc.) are diagnostics only — p999 drifts across sessions (this is why the interleaved board exists).

### Improvement targets (measurable “better”)

Targets for a video-worthy board: **HTTP session p50 &lt; 20 ms**, **p999 &lt; 200 ms**, **RSS &lt; 200 MB**, **combined @12 &lt; 15 000**.

#### 1. Runtime flags A/B (keep heap/--smol)

Artifacts: [`flags-ab-http-peers-verdict.md`](./flags-ab-http-peers-verdict.md), `gateway-multi-multiturn-flags-{on,off}-http-peers-10k.json`.

| Arm | Flags | flow p50 | flow p999 | RSS |
| --- | --- | ---: | ---: | ---: |
| Node HTTP | ON (512) | 37.4 | **223** | **384** |
| Node HTTP | OFF | 38.0 | 361 | 686 |
| Bun HTTP | ON (--smol) | 28.4 | **396** | 316 |
| Bun HTTP | OFF | 30.3 | 540 | 316 |

**Keep** Node `--max-old-space-size=512` and Bun `--smol` — they improve tails and Node RSS. GC/ELD logs barely overlap slow flows (near-zero), so the earlier 200→461 p999 jump was **not** explained by those flags.

#### 2–3. First session vs known-op (steady state)

A known operation means the agent already has its ID — from an earlier search, a skill, or memory. Real sessions sit between the two paths below, depending on how often operations repeat. Present them as a **pair**, not a single headline.

Artifact: [`gateway-multi-multiturn-targets-http-peers-10k.json`](./gateway-multi-multiturn-targets-http-peers-10k.json) (Bun HTTP, flags ON).

| Path | What it models | Combined @12 | Rebuild (defs + Σ disc + Σ res) | RPCs/turn | flow p50 / p999 | RSS | Targets |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| **First session** (search → execute) | Cold agent; must discover | **12 390** | **308 + 3 408 + 8 674** | 2 | 29.7 / 520 | 317 | tok ✓ · p50/p999/rss ✗ |
| **Known-op** (execute by ID) | Steady state; ID already known | **8 863** | **189 + 0 + 8 674** | **1** | **15.6 / 169** | 311 | **tok ✓ p50 ✓ p999 ✓** · rss ✗ |
| MCPJungle | Peer (1 RPC) | 35 322 | 5 840 + 0 + 29 482 | 1 | 14.8 / 132 | **153** | — |
| agentgateway | Peer (1 RPC) | 35 002 | 5 520 + 0 + 29 482 | 1 | 15.2 / 181 | 212 | — |

**Known-op rebuild (why not 297 + 8 674):** classic Layer1 on the primary board is **297** (search + execute schemas). Known-op only loads **execute** → Layer1 **189**. So 297 + 8 674 = 8 971, and measured **8 863** is **108** below that — exactly the search tool schema dropped from context (297 − 189). Discovery is already 0; results are unchanged (8 674). On this targets board Layer1 is 308 for the compact first-session path (search schema text differs slightly under the bench compact envelope); the 108 figure anchors to the familiar classic **297**.

**Compact search is a benchmark setting**, not the product default. Harness sets `CLAWQL_SEARCH_COMPACT=1` (`clawql-bench-env.mjs`) so discovery drops **11 568 → 3 408**. Keep it gated until the routing evaluation clears it for product.

Known-op vs MCPJungle: **35 322 ÷ 8 863 ≈ 4.0×** fewer tokens; flow median **0.8 ms** behind (15.6 vs 14.8). Three targets hit on the steady-state path.

**Video line (after memory + merge — single clean render):** when operations repeat, ClawQL matches the Go and Rust gateways’ session speed with about **4× fewer tokens**, and governs every call.

#### Search vs execute p999 (first-session path)

Artifact: [`gateway-multi-multiturn-search-exec-split-10k.json`](./gateway-multi-multiturn-search-exec-split-10k.json) (Bun HTTP, flags ON, compact search, n=10 000).

| Call | p50 | p999 | max | n ≥100 ms |
| --- | ---: | ---: | ---: | ---: |
| **search** | 0.99 | **3.6** | 567 | 7 |
| **execute** | 1.32 | **4.8** | 566 | 11 |
| flow e2e (12 turns) | 29.4 | **450** | 611 | — |

Steady per-call p999 is fine (&lt;5 ms). Flow p999 is rare single-RPC spikes (~500 ms) on **either** call — of 18 turns ≥100 ms, **search owned 7 / execute owned 11**. GC correlation still empty. So the remaining tail is not “search scoring every request”; it is infrequent event-loop / scheduling stalls that can land on whichever RPC is in flight. Known-op (execute-only) still wins session p999 (**130 ms** on this split board) by removing the second RPC and half the spike surface.

**Stall localization** (see [`stall-memory-round5.md`](./stall-memory-round5.md)): publish p999 stays **client e2e**. JSON responses (`hold_ms≈0`) — not SSE hold-open. Classes: **in-handler** execute (CPU profile ≈**78% idle** → off-CPU/I/O wait, not JS grind), **pre-handler event-loop queue** (`server_t0` late), and rare **client-long / server-short** POSTs with no matching `[clawql-http-slow]`. Diagnostics packaging: [`diagnostics-packaging.md`](./diagnostics-packaging.md) — not `clawql-data` / `clawql-analytics`. `MT_STALL_DIAG=1` / `MT_HTTP_CPU_PROF=1`.

#### 4. Memory (&lt;200 MB) — anonymous data at Ready

Bun HTTP under-load was ~311–317 MB **with and without** `--smol` (flags A/B). Node dropped 686 → 384 MB with the heap cap; Bun did not — so on Bun the budget is **loaded modules + eager data**, not reclaimable GC.

**Lazy-import pass (this branch):** HTTP no longer statically loads payments / network / GraphQL / HITL / webhooks / gRPC / chatgpt / inference / ouroboros at listen. Bench sets `CLAWQL_HTTP_SKIP_PAYMENTS=1`. Those packages stay **unmapped**.

**smaps + DuckDB:** lazy `clawql-data` keeps DuckDB unmapped. Same-probe lean vs fat listen ([`catalog-listen-rss.json`](./catalog-listen-rss.json)): **233 → 280 MB** (**+47 MB** for the fat equal-arm catalog; spec file only +50 KB). Sessions stay **1**; terminate frees ~16 MB. Under-load plateau is mostly Ready + that catalog delta, not traffic growth (see [`stall-memory-round3.md`](./stall-memory-round3.md)).

Bun `--smol` RSS ladder (same host): empty **13** → express **37** → effect **40** → MCP SDK **39** → `clawql-api` **88** → `import(server-http)` **165** → lean Ready (lazy DuckDB) **~155**. Fat-catalog listen / multiturn warm **~280–295**; under-load plateau **~320**.

```bash
# Publish board — every arm, one interleaved process
MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=direct,clawql,clawql_bun,clawql_http,clawql_http_bun,clawql_grpc,clawql_grpc_bun,executor,executor_v2,mcpjungle,agentgateway \
  EXECUTOR_BIN=…/executor EXECUTOR_CWD=… \
  EXECUTOR_V2_URL=http://127.0.0.1:4312/mcp EXECUTOR_V2_API_KEY=… EXECUTOR_V2_PID=… \
  MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway \
  BUN_BIN=~/.bun/bin/bun \
  MT_OUT=gateway-multi-multiturn-publish-all-arms-10k.json \
  npm run benchmark:gateway-multi-multiturn
```

### ClawQL transport matrix (same recipe)

Same search→execute+projection multiturn as the primary board — only runtime × transport changes. Artifact: [`gateway-multi-multiturn-clawql-transport-10k.json`](./gateway-multi-multiturn-clawql-transport-10k.json).

| Arm | Runtime | Transport | Notes |
| --- | --- | --- | --- |
| `clawql` | Node | stdio | Primary publish peer (`--max-old-space-size=512`) |
| `clawql_bun` | Bun | stdio | Same tokens; lower RSS (`--smol`) |
| `clawql_http` | Node | Streamable HTTP | Fair peer for Executor v2 HTTP latency |
| `clawql_http_bun` | Bun | Streamable HTTP | Post-fix HTTP median peer for video |
| `clawql_grpc` | Node | gRPC MCP | **ClawQL-only** — peers have no gRPC MCP here; Layer1 −16 vs stdio |
| `clawql_grpc_bun` | Bun | gRPC MCP | Same |

HTTP arms set `CLAWQL_MCP_DISABLE_STANDALONE_SSE=1` (GET `/mcp` → 405) so the SDK skips standalone SSE buffers. Server also prunes orphan JSON `_streamMapping` entries after each sessionful POST (SDK JSON-mode leak). Node HTTP RSS can still look climb-shaped under long multiturn (GC lag); Bun tends to plateau. gRPC on this small-payload board is typically slower than Streamable HTTP — prefer gRPC for large `CallTool` bodies.

**Video / marketing:** latency section uses **HTTP-to-HTTP** numbers (ClawQL HTTP vs Executor v2 / MCPJungle / agentgateway). Replace “3× to 9× tighter tail” with per-call parity + &gt;2× vs Executor v2. Any scene that says Executor adds ~18 666 via pretty-printing must name **v1.6.10 on-screen**.

**Discovery = 0 (both Executor versions):** harness-authored `execute`; `skills`/search unused. Favors Executor vs ClawQL’s charged **11 568**.

**Claim bound:** four gateways measured + ClawQL transport matrix. Bifrost / mcp-gateway (compact meta-tool shortlist) **not** on this board — do not claim the whole category until they are.

**Next ClawQL token lever — discovery (11 568 = 56% of combined):** leaner search hits (~300 tok/turn would cut ~8k @12), and/or skip search when the agent already knows the operation (`execute` by operation ID; measure op-repeat rate). Neither touches projection.

```bash
# Primary board (stdio arms + aggregators)
MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=direct,clawql,clawql_bun,executor,mcpjungle,agentgateway \
  EXECUTOR_BIN=…/executor EXECUTOR_CWD=… \
  MT_OUT=gateway-multi-multiturn-10k.json \
  npm run benchmark:gateway-multi-multiturn

# Executor v2 on the SAME harness (product is HTTP-only; pin native serve PID)
MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=executor_v2 \
  EXECUTOR_V2_URL=http://127.0.0.1:4312/mcp \
  EXECUTOR_V2_API_KEY=… EXECUTOR_V2_PID=… \
  MT_OUT=gateway-multi-multiturn-executor-v2-equal-10k.json \
  npm run benchmark:gateway-multi-multiturn

# Same thing via the compatibility npm script (wrapper → runExecutorArm; not a second recipe)
npm run benchmark:executor-v2-multiturn

# ClawQL transport matrix (Node/Bun × stdio/HTTP + gRPC)
MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=clawql,clawql_bun,clawql_http,clawql_http_bun,clawql_grpc,clawql_grpc_bun \
  MT_OUT=gateway-multi-multiturn-clawql-transport-10k.json \
  npm run benchmark:gateway-multi-multiturn

npm run generate:gateway-multi-page
```

`gateway-multi-multiturn-executor-v2-10k.json` is the **pre-equalization** artifact (separate recipe). Publish and `/benchmarks` use **`…-executor-v2-equal-10k.json` only**.

## Category win — 12-turn I/O tokens (fat catalog)

Single-tool p50 is a thin slice. The category ClawQL is built for is **multi-turn agents** where **input schemas** and **output payloads** both compound — **and the task still succeeds**.

### Equal-arm catalog

| Lever | Normalization |
| --- | --- |
| Surface | **40** verbose tools (`catalog_list_001`…`040`) — same names as OpenAPI `operationId`s |
| Fat result | Nested `items[]` + `meta`/`history` (~2411 tok/turn raw) |
| ClawQL path | `search` → `execute` with `where=items` + `fields=["id","name","status"]` |
| Aggregators | Full `tools/list` once (classic) + raw fat `callTool` |
| Executor | `execute` code returns the same fat JSON (matches measured live path: full payload pass-through; no gateway `fields`) |
| Task success | Deterministic: every turn’s rows must match expected available inventory for that partition |
| Turns | **12** unique partitions (see also N=24 artifact) |

**Settled (do not reopen):** Executor’s live Layer 2 is unmodified API JSON — [Both Sides of Context Compression](https://pragmaticvectors.com/posts/both-sides-of-context-compression), `executor-cmp-001.live.json` (143,466 tok `pulls.list`). A hand-written program that maps to slim fields is **not** Executor and must not appear on this board as Executor. Codemode gateways compress input; response-side field selection at the gateway layer is ClawQL’s differentiator.

### Board @ N=12 (classic: Layer1 once + Σ Layer2) — re-measured

| Arm | Layer1 once (tok) | Mean Layer2 (tok) | Mean **result** tok | Combined @12 | Task success |
| --- | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **297** (search+execute) | **1687** | **723** | **20 539** | **PASS** |
| Executor | 90 | 4465 | 4465 | 53 668 (2.61×) | **PASS** |
| MCPJungle | 5840 | 2457 | 2457 | 35 322 (1.72×) | **PASS** |
| agentgateway | 5520 | 2457 | 2457 | 35 002 (1.70×) | **PASS** |

Primary publish column is **classic** (Layer1 once). **Re-list every turn** is secondary — most clients cache tool lists; lazy clients shrink aggregator Layer1 further. Secondary numbers remain in the JSON for sensitivity analysis.

### Multiturn run

```bash
MT_TURNS=12 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=clawql,executor,mcpjungle,agentgateway \
  npm run benchmark:gateway-multi-multiturn
```

---

## TS7 rebuild — Node vs Bun (decision board)

Toolchain: **TypeScript 7.0.2** Go-native `tsc` (`@typescript/native`) + `@typescript/typescript6` for eslint/tsup API. Same rebuilt `dist/server.js`; only the JS runtime changes between arms. Sequential solo-arm runs (not interleaved with peers).

Artifacts: [`gateway-multi-cmp-ts7-node-10k.json`](./gateway-multi-cmp-ts7-node-10k.json), [`gateway-multi-cmp-ts7-bun-10k.json`](./gateway-multi-cmp-ts7-bun-10k.json), [`gateway-multi-cmp-ts7-node-chaos.json`](./gateway-multi-cmp-ts7-node-chaos.json), [`gateway-multi-cmp-ts7-bun-chaos.json`](./gateway-multi-cmp-ts7-bun-chaos.json).

### n=10 000

| Arm | Ready RSS | Under-load med | e2e p50 / p99 / **p999** | Gateway cost p50 / **p999** |
| --- | ---: | ---: | ---: | ---: |
| **Node** v22.14 | 234 MB | 409 MB | 0.76 / 2.53 / **5.10** | 0.60 / 4.75 |
| **Bun** 1.4.3 | **179 MB** (−23%) | **309 MB** (−25%) | **0.34 / 1.88 / 5.52** | **0.20 / 5.16** |

### Chaos until-break

| Arm | last_ok / first_break | Break |
| --- | ---: | --- |
| Node | **70 / 71** | p99 115 ms |
| Bun | 62 / 63 | p99 102 ms |

### Decision inputs

- Bun wins Ready/under-load RSS and **p50** latency/cost hard (−55% e2e p50, −67% cost p50).
- Bun does **not** win p999 on this host (Node 5.10 vs Bun 5.52) or chaos ceiling.
- Still not MCPJungle-class RSS. Compiler upgrade (TS7) is CI/DX only — these boards are the runtime comparison.

## Node vs Bun runtime (same Core binary)

Drop-in experiment: `clawql` (Node v22.14.0) vs `clawql_bun` (Bun 1.4.3) — same `dist/server.js`, same equal-arm env, only the JS runtime binary changes (`MULTI_ARMS=clawql,clawql_bun`, optional `BUN_BIN`).

### Board — n=10 000 interleaved

| Arm | Ready RSS | Under-load med RSS | e2e p50 / p99 / **p999** (ms) | Gateway cost p50 / **p999** |
| --- | ---: | ---: | ---: | ---: |
| **ClawQL (Node)** | 232 MB | 413 MB | 0.99 / 3.13 / 6.70 | 0.76 / 6.19 |
| **ClawQL (Bun)** | **180 MB** (−22%) | **296 MB** (−28%) | **0.74 / 2.56 / 6.28** | **0.52 / 5.78** |

### Chaos — topology A until-break

| Arm | last_ok / first_break | Break reason | Ready RSS |
| --- | ---: | --- | ---: |
| ClawQL (Node) | **75 / 76** | p99 101 ms | 231 MB |
| ClawQL (Bun) | 64 / 65 | p99 121 ms | **181 MB** |

### Verdict (switch vs Rust pain)

- **Compelling for RSS + p50 cost** as a low-rewrite lever: ~¼ less Ready RSS, ~¼ less under-load median, ~25–30% lower gateway_cost p50 — without touching the Effect/TS codebase.
- **Not a concurrency win** on this host (Bun broke slightly earlier). Do not sell Bun as a chaos ceiling upgrade.
- **Still not Go-parity** — MCPJungle under-load ~152 MB / chaos min ~97 MB. Bun shrinks the Node tax; it does not replace a thin native multiplexer.
- **Operational pain is real but bounded** (native addons, CI matrix, production support) — usually less than a Rust rewrite of the governed path. Treat Bun as an optional runtime track, not the RSS endgame.

```bash
BUN_BIN=~/.bun/bin/bun \
  MULTI_ARMS=clawql,clawql_bun MULTI_ITERS=10000 MULTI_SKIP_CHAOS=1 \
  MULTI_OUT=gateway-multi-cmp-bun-10k.json \
  npm run benchmark:gateway-multi-comparison

BUN_BIN=~/.bun/bin/bun \
  MULTI_ARMS=clawql,clawql_bun MULTI_ITERS=100 MULTI_CHAOS_UNTIL_BREAK=1 \
  MULTI_CHAOS_MAX=512 MULTI_OUT=gateway-multi-cmp-bun-chaos.json \
  npm run benchmark:gateway-multi-comparison
```

---

## RSS — admit the loss

ClawQL is the **heaviest serious arm** on this board:

| Signal | ClawQL | MCPJungle | Notes |
| --- | ---: | ---: | --- |
| Cold Ready | ~232 MB | — | After composition slim + lazy optional imports |
| Chaos min / med | 259 / 342 | 97 / 109 | Single-instance |
| 10k under-load median | ~427 MB | ~152 MB | V8 watermark under interleaved load |

Levers landed: INSTANCE_SPEC slim Core, lazy optional imports, lazy `clawql-data` (DuckDB) off HTTP Ready, WORM ring cap, session catalog max, `CLAWQL_MCP_SESSION_IDLE_MS` + `/healthz` bench stats. **Bun runtime** trims Ready ~22% / under-load ~28% without a rewrite (see [Node vs Bun](#node-vs-bun-runtime-same-core-binary)) — still not MCPJungle-class. Under-load plateau is **not** MCP session pileup; chase fat-catalog + first-flow caches ([`stall-memory-round2.md`](./stall-memory-round2.md)). **If RSS stays high, say so** — hiding a memory loss costs more than admitting it. Scale-out multiplies RSS; concurrency claims must price that in.

---

## Arms off the publish board

| Arm | Why off |
| --- | --- |
| **ContextForge** | Prior run nested through MCPJungle — inflates latency, memory, and chaos. Re-add only with native REST virtualization calling `/pets` directly. |
| **MetaMCP** | Not run (Docker Compose–first). Do not list as a peer without a measured arm. |

Default `MULTI_ARMS` / `MT_ARMS` omit both.

---

## Code levers landed (this branch)

1. **Bench composition honesty** — `scripts/benchmarks/lib/clawql-bench-env.mjs` sets `CLAWQL_INSTANCE_SPEC` (8.0 ignores bare `ENABLE_*=0`; fake `TIER=gateway` was falling through to `standard`).
2. **Lazy optional imports** — `wireOptionalToolDeps()`; no static `nats/env` in dynamic compose; pgvector / vault only when memory on; mcp-tool-wrap lazy-loads payments/observability/audit (§11.1).
3. **WORM memory ring cap** — `CLAWQL_WORM_MEMORY_MAX_ENTRIES` (default 10 000).
4. **Session catalog eviction** — `CLAWQL_CAPABILITY_SESSION_MAX` (default 256).
5. **Chaos checkpoints** — board JSON flushed after latency and after each arm (survives host OOM mid-refine).
6. **Multiturn fairness** — deterministic `task_success`; classic Layer1-once is primary; re-list demoted. No simulated Executor “filter” arm on the publish board (settled: gateway has no response-side projection).
7. **Chaos until-break + topology tags** — `MULTI_CHAOS_UNTIL_BREAK`; reports carry `topology` so cross-topology claims fail the honesty check.
8. **`clawql_bun` runtime arm** — same Core binary under Bun; board artifacts `gateway-multi-cmp-bun-10k.json` / `gateway-multi-cmp-bun-chaos.json`.
9. **Lazy `clawql-data`** — static horizontal composer loads DuckDB only when `enableData` (HTTP Ready probe ~155 MB anon-dominated).
10. **Stall / smaps probes** — `interleaved-stall-probe.mjs`, `bun-ready-memory-probe.mjs`, `session-rss-phase-probe.mjs`; write-ups in [`stall-memory-diagnostics.md`](./stall-memory-diagnostics.md) / [`stall-memory-round2.md`](./stall-memory-round2.md).
11. **Bench stats + idle sessions + timer trace** — `CLAWQL_BENCH_STATS`, `CLAWQL_MCP_SESSION_IDLE_MS`, `CLAWQL_TIMER_TRACE`.

**Next:** topology B (4× behind LB) for every arm before any scale-out claim; instrument upstream fetch wait for stalls; slim fat-catalog listen + first-flow caches for under-load &lt;200 MB (session DELETE will not get there). Date/version stamps on published executor-cmp pages (housekeeping).

---

## Honesty / publish hold

- Host-bound; repeat on a dedicated bench host before publicizing.
- **RSS is a loss** among serious arms — scope or fix before claiming efficiency without the asterisk.
- Do not cite n=200 boards for p999.
- Do not mix NATS scale-out ceilings with stdio process-per-client ceilings.
- Do not publish aggregator concurrency wins until every arm breaks on the same topology.
- ContextForge / MetaMCP off until native equal-arm runs exist.
- Multiturn ClawQL Layer2 includes per-turn `search` (discovery tax); result-only gap vs fat peers is larger (~3.4×).
- Token wins require `task_success` — projection must not drop facts the agent needed.
