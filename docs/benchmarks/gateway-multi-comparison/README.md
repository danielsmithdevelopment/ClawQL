# Multi-gateway equal-arm comparison

Publish posture: **most efficient governed gateway** — claims only what holds under equal topology, equal task success, and an honest path matrix. Numbers below are host-bound; re-run on a dedicated bench host before external publish.

| Artifact | What it proves |
| --- | --- |
| [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) | Interleaved latency / gateway_cost / RSS (n=10 000) |
| [`gateway-multi-cmp-chaos-slim.json`](./gateway-multi-cmp-chaos-slim.json) | Chaos ceilings — **single-instance / stdio equal-arm** (not cross-topology) |
| [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json) | **12-turn I/O tokens + task success** on a fat catalog |
| [`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json) | Same board at N=24 (compounding check) |
| [`gateway-multi-multiturn-bifrost.json`](./gateway-multi-multiturn-bifrost.json) | Same N=12/C=40 fixture + Bifrost classic / Code Mode (opt-in arms) |

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

## RSS — admit the loss

ClawQL is the **heaviest serious arm** on this board:

| Signal | ClawQL | MCPJungle | Notes |
| --- | ---: | ---: | --- |
| Cold Ready | ~232 MB | — | After composition slim + lazy optional imports |
| Chaos min / med | 259 / 342 | 97 / 109 | Single-instance |
| 10k under-load median | ~427 MB | ~152 MB | V8 watermark under interleaved load |

Levers landed: INSTANCE_SPEC slim Core, lazy optional imports, WORM ring cap, session catalog max. Remaining: further lazy `clawql-api` deps, post-GC steady-state RSS arm, Node heap tuning. **If RSS stays high, say so** — hiding a memory loss costs more than admitting it. Scale-out multiplies RSS; concurrency claims must price that in.

---

## Arms off the publish board

| Arm | Why off |
| --- | --- |
| **ContextForge** | Prior run nested through MCPJungle — inflates latency, memory, and chaos. Re-add only with native REST virtualization calling `/pets` directly. |
| **MetaMCP** | Not run (Docker Compose–first). Do not list as a peer without a measured arm. |

Default `MULTI_ARMS` / `MT_ARMS` omit Bifrost, ContextForge, and MetaMCP. Bifrost is measured below but stays opt-in until the category story absorbs Code Mode honestly.

### Bifrost on the N=12 / C=40 board

Same fixture as the publish multiturn table (`MT_TURNS=12`, `CATALOG_TOOL_COUNT=40`, `MT_LIMIT=25`). Artifact: [`gateway-multi-multiturn-bifrost.json`](./gateway-multi-multiturn-bifrost.json). Binary: `npx @maximhq/bifrost` → `~/.cache/bifrost/<ver>/bin/bifrost-http-*` or `BIFROST_BIN`.

| Arm | Layer1 once (tok) | Mean Layer2 (tok) | Mean **result** tok | Combined @12 | Task success | vs ClawQL (same session) |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| **ClawQL** (same session) | **413** | **1687** | **723** | **20 655** | **PASS** | 1× |
| Bifrost classic | 5520 | 2457 | 2457 | 35 002 (1.69×) | **PASS** | ≈ agentgateway |
| Bifrost Code Mode | 3459 | 1377 | 1377 | **19 977 (0.97×)** | **PASS** | near-tie / slight Code Mode lead |

**How to read this (do not claim category dominance from it):**

1. **Classic Bifrost** matches the other aggregators (~1.7× ClawQL) — full `tools/list` + fat `callTool`.
2. **Code Mode** near-ties ClawQL on **combined** classic under the harness Layer2 definition (full MCP text). Meta-tool schemas + once `readToolFile(catalog.pyi)` still cost ~3.5k Layer1 vs ClawQL’s search+execute (~0.4k).
3. **Result projection** still favors ClawQL (~1.9× lower mean result tok): Code Mode’s `executeToolCode` echoes the fat upstream dump in `Print output` before the slim `Return value`, so Layer2 is not slim-only.
4. Same-session ClawQL Layer1 here is **413** vs the earlier publish board **297** (schema drift on this build); Layer2/result match the publish board. Ratios use the same-session ClawQL row.
5. C=8 smoke ([`gateway-multi-multiturn-bifrost-smoke.json`](./gateway-multi-multiturn-bifrost-smoke.json)) had Code Mode *worse* than classic — Code Mode’s Layer1 win needs a fat catalog.

```bash
export BIFROST_BIN="${BIFROST_BIN:-$HOME/.cache/bifrost/v2.3.0/bin/bifrost-http-0}"

MT_TURNS=12 CATALOG_TOOL_COUNT=40 MT_LIMIT=25 \
  MT_ARMS=clawql,bifrost,bifrost_codemode \
  MT_OUT=gateway-multi-multiturn-bifrost.json \
  npm run benchmark:gateway-multi-multiturn
```

---

## Code levers landed (this branch)

1. **Bench composition honesty** — `scripts/benchmarks/lib/clawql-bench-env.mjs` sets `CLAWQL_INSTANCE_SPEC` (8.0 ignores bare `ENABLE_*=0`; fake `TIER=gateway` was falling through to `standard`).
2. **Lazy optional imports** — `wireOptionalToolDeps()`; no static `nats/env` in dynamic compose; pgvector / vault only when memory on; mcp-tool-wrap lazy-loads payments/observability/audit (§11.1).
3. **WORM memory ring cap** — `CLAWQL_WORM_MEMORY_MAX_ENTRIES` (default 10 000).
4. **Session catalog eviction** — `CLAWQL_CAPABILITY_SESSION_MAX` (default 256).
5. **Chaos checkpoints** — board JSON flushed after latency and after each arm (survives host OOM mid-refine).
6. **Multiturn fairness** — deterministic `task_success`; classic Layer1-once is primary; re-list demoted. No simulated Executor “filter” arm on the publish board (settled: gateway has no response-side projection).
7. **Chaos until-break + topology tags** — `MULTI_CHAOS_UNTIL_BREAK`; reports carry `topology` so cross-topology claims fail the honesty check.

**Next:** fold Bifrost Code Mode into the category narrative without claiming dominance (combined near-tie; ClawQL still leads result projection); update [dominance roadmap](../dominance-roadmap.md) status to partial/measured; topology B (4× behind LB) for every arm before any scale-out claim; optional real-model task-success arm; RSS heap profile / lazy `clawql-api` if we want to close the memory loss.

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
- **Do not claim category dominance over Bifrost Code Mode** from the N=12/C=40 board: combined classic is a near-tie (0.97× ClawQL) when Layer2 counts full `executeToolCode` text. ClawQL’s clear lead there is mean result tok (~1.9×) and Layer1 size — not combined tokens.
