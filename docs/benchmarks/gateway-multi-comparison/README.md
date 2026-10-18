# Multi-gateway equal-arm comparison

Publish posture: **most efficient governed gateway** — claims only what holds under equal topology, equal task success, and an honest path matrix. Numbers below are host-bound; re-run on a dedicated bench host before external publish.

| Artifact | What it proves |
| --- | --- |
| [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) | Interleaved latency / gateway_cost / RSS (n=10 000) |
| [`gateway-multi-cmp-chaos-slim.json`](./gateway-multi-cmp-chaos-slim.json) | Chaos ceilings — **single-instance / stdio equal-arm** (not cross-topology) |
| [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json) | **12-turn I/O tokens + task success** on a fat catalog |
| [`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json) | Same board at N=24 (compounding check) |
| [`gateway-multi-multiturn-bifrost.json`](./gateway-multi-multiturn-bifrost.json) | Same N=12/C=40 fixture + Bifrost classic / Code Mode (opt-in arms) |
| [`gateway-multi-multiturn-obot.json`](./gateway-multi-multiturn-obot.json) | Same fixture + Obot `mcp-connect` (remote equal-arm catalog) |

---

## Category story (what we claim)

| Claim | Status | Bound |
| --- | --- | --- |
| **Fewest tokens among MCP aggregators + live Executor with equal task success** | **Primary** — classic Layer1-once + Σ Layer2 @12; all arms `task_success` PASS | ClawQL **8.9k** vs MCPJungle **35.3k** (**3.98×**), agentgateway / Bifrost / Obot **35.0k** (**3.95×**), Bifrost Code Mode **20.0k** (**2.25×**), Executor **53.7k** (**6.06×**). Compact search + compact execute JSON; Layer 2 is the win — same gap as [Both Sides of Context Compression](https://pragmaticvectors.com/posts/both-sides-of-context-compression). |
| **Lowest governed gateway cost** | **Supported** on n=10k remasure — ClawQL gateway_cost p50 **0.70 ms** vs Executor **2.39 ms** | Same equal-arm pets upstream contract |
| **Latency competitive with the fastest aggregators while doing more per call** | **Supported** — ClawQL best p50; tails host-bound (see 10k table) | Read with [path matrix](#path-matrix-what-each-arm-does) |
| **Scale-out concurrency win** | **Not claimed** | Topology B measured (4× HTTP behind sticky LB): ClawQL **121** ≈ MCPJungle **125** > agentgateway **47**. Near-tie with MJ — not a scale-out supremacy claim |

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
| **Multi-turn I/O tokens (classic)** | **Lead** vs aggregators (~4× combined @12) and fat Executor (~6×). Re-list-every-turn is **secondary** (most clients cache `tools/list`; lazy clients shrink aggregator schema cost further). |
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

## Board — n=10 000 interleaved (remeasured 2026-10-17)

Artifact: [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) (`measuredAt` 2026-10-17). Compact ClawQL path; same equal-arm pets fixture.

| Arm | e2e p50 / p95 / p99 / **p999** (ms) | Gateway cost p50 / p99 / **p999** | RSS med MB | Tools | List tok | Invoked schema | Result tok |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **1.02 / 2.33 / 7.80 / 11.27** | **0.70 / 6.70 / 10.93** | **389**† | **8** | **1240** | 178 | 28 |
| **Executor** | 2.39 / 7.86 / 10.96 / 22.78 | 2.39 / 10.96 / 22.78‡ | 255 | 7 | 2281 | 128 | 59 |
| **MCPJungle** | 1.37 / 6.26 / 9.01 / 14.47 | 1.05 / 8.66 / 13.62 | **151** | 1 | 46 | 46 | 28 |
| **agentgateway** | 1.17 / 4.66 / 8.89 / 14.33 | 0.85 / 8.51 / 13.14 | 216 | 1 | 37 | 37 | 28 |

† Under-load median. Heaviest serious arm — see RSS section.  
‡ Executor gateway_cost = e2e (upstream=0).

**Read:** ClawQL still best **p50** e2e and gateway_cost. Tail percentiles (p99/p999) moved up vs the Oct-11 board on this host — do not claim a p999 latency win. Token list surface for ClawQL remains compact (**1240** list tok / 8 tools).

---

## Chaos — topology rules

### What this board measures

| Topology | Arms | Artifact |
| --- | --- | --- |
| **A — Single instance** | ClawQL stdio PPC; Executor **stdio or HTTP `/mcp`**; MCPJungle / agentgateway 1× HTTP | [`gateway-multi-cmp-chaos-slim.json`](./gateway-multi-cmp-chaos-slim.json) |
| **B — Scale-out (4× HTTP behind sticky LB)** | ClawQL HTTP ×4; MCPJungle ×4; agentgateway ×4 — same Node sticky LB (`clawql_bench_sticky`) | [`gateway-multi-cmp-chaos-topology-b.json`](./gateway-multi-cmp-chaos-topology-b.json) |
| **Fabric (not B)** | ClawQL NATS sticky assign (executor-cmp) | Separate — do not cite as Topology B |

**Claim only within the same topology.** Push every arm until it **actually breaks** (`MULTI_CHAOS_UNTIL_BREAK=1`, raise `MULTI_CHAOS_MAX`). Stopping at 128 without a break is incomplete for concurrency claims.

### Board A — slim composition (p99≤100 ms), until-break (remeasured 2026-10-17)

| Arm | Topology | last_ok / first_break | Break reason | Notes |
| --- | --- | ---: | --- | --- |
| **ClawQL** | stdio 1× | **79 / 80** | p99 107 ms | Up from 63/64 |
| Executor | **HTTP 1×** `/mcp` | **29 / 30** | p99 110 ms | Executor 2.x Streamable HTTP; stdio historical 23/24 still blocked (`Unauthorized`) |
| MCPJungle | HTTP 1× | **151 / 152** | p99 111 ms | Host-bound (was 204); still leads topology A |
| agentgateway | HTTP 1× | **63 / 64** | p99 115 ms | Matches prior ceiling |

On equal single-instance footing: **MCPJungle still leads concurrency** (151); ClawQL (**79**) > agentgateway (**63**) > Executor HTTP (**29**). Publishable chaos claim remains **vs Executor** on topology A — not a scale-out win. Multi-arm chaos OOM’d once on this host; ceilings above are from completed solo until-break runs (see `merge_note` / `gateway-multi-cmp-chaos-executor-http.json`).

### Board B — 4× HTTP behind sticky Node LB (p99≤100 ms), until-break (2026-10-18)

Harness: `npm run benchmark:gateway-multi-topology-b` (`scripts/benchmarks/gateway-multi-topology-b.mjs` + `lib/sticky-http-lb.mjs`). Each arm: **4 replicas** → VIP `/mcp` with cookie + `x-bench-sticky` affinity. LB `by_backend` counts were roughly even (ClawQL ~17–19k hits/backend).

| Arm | Topology | last_ok / first_break | Break reason | Notes |
| --- | --- | ---: | --- | --- |
| **ClawQL** | HTTP 4× + sticky LB | **121 / 122** | p99 130 ms | Equal-arm OpenAPI `execute`; not NATS fabric |
| **MCPJungle** | HTTP 4× + sticky LB | **125 / 126** | p99 108 ms | Near-tie with ClawQL; 1× A was 151 (host-bound) |
| **agentgateway** | HTTP 4× + sticky LB | **47 / 48** | p99 119 ms | Unique admin/ready/stats ports per replica |

**Read:** On equal Topology B, ClawQL (**121**) ≈ MCPJungle (**125**) ≫ agentgateway (**47**). **Do not claim a scale-out concurrency win** — MJ still edges ClawQL. Do not cite NATS fabric **135** or Executor stdio PPC **19** on this board. Executor HTTP ×4 behind the same LB is still open.

```bash
MULTI_CHAOS_UNTIL_BREAK=1 MULTI_CHAOS_HARD_MAX=1024 MULTI_B_REPLICAS=4 \
  MULTI_B_ARMS=clawql,mcpjungle,agentgateway \
  npm run benchmark:gateway-multi-topology-b
```

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

# Chaos until break (single-instance) — stdio Executor (may hit daemon Unauthorized)
MULTI_ITERS=100 MULTI_SKIP_CHAOS=0 MULTI_CHAOS_UNTIL_BREAK=1 MULTI_CHAOS_MAX=512 \
  MULTI_ARMS=clawql,executor,mcpjungle,agentgateway \
  MULTI_OUT=gateway-multi-cmp-chaos-slim.json \
  npm run benchmark:gateway-multi-comparison

# Executor 2.x HTTP chaos (fair peer for aggregator 1× HTTP) — start serve first:
#   EXECUTOR_DATA_DIR=/tmp/executor-v2-data EXECUTOR_PORT=4312 /tmp/executor-v2/node_modules/.bin/executor serve
MULTI_ITERS=50 MULTI_SKIP_CHAOS=0 MULTI_CHAOS_UNTIL_BREAK=1 MULTI_CHAOS_MAX=512 \
  MULTI_ARMS=executor \
  EXECUTOR_MCP_URL=http://127.0.0.1:4312/mcp \
  EXECUTOR_API_KEY_FILE=/tmp/executor-v2-data/api_key.txt \
  MULTI_OUT=gateway-multi-cmp-chaos-executor-http.json \
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

### Board @ N=12 (classic: Layer1 once + Σ Layer2) — compact search + execute

Artifact: [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json). Agent-facing MCP text is minified JSON (`detail=compact` search hits; execute success bodies no longer pretty-printed).

| Arm | Layer1 once (tok) | Mean Layer2 (tok) | Mean **result** tok | Combined @12 | Task success |
| --- | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **348** (search+execute) | **710** | **399** | **8 866** | **PASS** |
| Executor | 128 | 4465 | 4465 | 53 706 (**6.06×**) | **PASS** |
| MCPJungle | 5840 | 2457 | 2457 | 35 322 (**3.98×**) | **PASS** |
| agentgateway | 5520 | 2457 | 2457 | 35 002 (**3.95×**) | **PASS** |
| Obot | 5520 | 2457 | 2457 | 35 002 (**3.95×**) | **PASS** |
| Bifrost classic | 5520 | 2457 | 2457 | 35 002 (**3.95×**) | **PASS** |
| Bifrost Code Mode | 3459 | 1377 | 1377 | 19 977 (**2.25×**) | **PASS** |

Full remasure 2026-10-17 (`measuredAt` on the JSON): all arms above in one run. Obot is the same fat `tools/list` + `callTool` aggregator path via `mcp-connect` ([dominance-peers-wiring](../dominance-peers-wiring.md)). Side artifacts: [`gateway-multi-multiturn-obot.json`](./gateway-multi-multiturn-obot.json), [`gateway-multi-multiturn-bifrost.json`](./gateway-multi-multiturn-bifrost.json).

Primary publish column is **classic** (Layer1 once). **Re-list every turn** is secondary — most clients cache tool lists; lazy clients shrink aggregator Layer1 further. Secondary numbers remain in the JSON for sensitivity analysis.

**N=24 compounding** ([`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json), remasured): ClawQL **17 434** vs MCPJungle **64 854** (**3.72×**), agentgateway / Bifrost / Obot **64 534** (**3.70×**), Bifrost Code Mode **36 537** (**2.10×**), Executor **107 334** (**6.16×**) — ratios hold as turns double.

### Multiturn run

```bash
export EXECUTOR_BIN=/tmp/executor-try/node_modules/.bin/executor
export EXECUTOR_CWD=/tmp/executor-try
export EXECUTOR_DATA_DIR=/tmp/executor-v1-data   # required for Executor 1.x stdio
# Or Executor 2.x HTTP: EXECUTOR_MCP_URL=http://127.0.0.1:4312/mcp EXECUTOR_API_KEY=…

MT_TURNS=12 CATALOG_TOOL_COUNT=40 \
  MT_ARMS=clawql,executor,mcpjungle,agentgateway \
  npm run benchmark:gateway-multi-multiturn

# Obot (after catalog HTTP + mcp-connect registration — see dominance-peers-wiring.md)
export OBOT_MCP_URL=http://127.0.0.1:8080/mcp-connect/<ms-id>
export OBOT_MCP_TOKEN=clawql-bench-token
MT_TURNS=12 CATALOG_TOOL_COUNT=40 MT_LIMIT=25 \
  MT_ARMS=clawql,obot MT_OUT=gateway-multi-multiturn-obot.json \
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

**Product lever:** MCP `search` defaults to `detail=compact` (signature/score/risk; no `parameters[]` / schemas) and minified JSON — peer-shaped like Code Mode `.pyi` stubs. Pass `detail=full` when an agent needs deep inspect.

| Arm | Layer1 once (tok) | Mean Layer2 (tok) | Mean **result** tok | Combined @12 | Weighted @12 (×5 model-written) | Task success | vs ClawQL |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| **ClawQL** (compact search + execute every turn) | **348** | **710** | **399** | **8 866** | **11 626** | **PASS** | 1× |
| Bifrost classic | 5520 | 2457 | 2457 | 35 002 | 35 842 | **PASS** | **3.95×** |
| Bifrost Code Mode | 3459 | 1377 | 1377 | 19 977 | 23 697 | **PASS** | **2.25×** (weighted **2.04×**) |

**How to read this:**

1. **Combined classic win vs Code Mode is solid** (**2.25×**) after compact search *and* compact execute — prior near-tie (0.97×) used fat pretty-printed search hits; compact-search-only still left pretty execute JSON (~12.7k / 1.57×).
2. **Classic Bifrost** tracks aggregators (~**3.95×** here; same fat `callTool` path as agentgateway).
3. **Result projection** still favors ClawQL (~**3.45×** leaner mean result): Code Mode’s `executeToolCode` echoes the fat upstream dump in `Print output` before the slim `Return value` (Layer2 counts full MCP text).
4. Secondary **weighted** column adds ×5 model-written args/code (dominance roadmap); Code Mode stays ~**2.0×**.
5. Optional `MT_CLAWQL_DISCOVERY=once` mirrors Code Mode’s discover-once path; default `every_turn` is the conservative aggregator peer. Compact JSON is the only agent-facing text format (no YAML / columnar / CBOR options).

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
8. **Compact agent-facing JSON** — `search` defaults to `detail=compact` + minify; `execute` success bodies serialize without pretty-print (no YAML/columnar/CBOR options). Executor harness accepts `EXECUTOR_DATA_DIR` / `EXECUTOR_MCP_URL`.

**Next:** Flip www concurrency cells for Topology B (ClawQL 121 ≈ MJ 125). Optional Executor HTTP ×4 behind the same sticky LB. TrueFoundry equal-arm still needs tenant creds. Optional real-model task-success; RSS heap profile / lazy `clawql-api` if we want to close the memory loss.

---

## Honesty / publish hold

- Host-bound; repeat on a dedicated bench host before publicizing.
- **RSS is a loss** among serious arms — scope or fix before claiming efficiency without the asterisk.
- Do not cite n=200 boards for p999.
- Do not mix NATS fabric sticky, Topology B LB, or Topology A single-instance ceilings.
- Topology B is measured — ClawQL ≈ MCPJungle; do not claim scale-out supremacy.
- ContextForge / MetaMCP off until native equal-arm runs exist.
- Multiturn ClawQL Layer2 includes per-turn `search` (discovery tax); mean **result** gap vs fat peers is larger (~6× aggregators / ~11× Executor).
- Token wins require `task_success` — projection must not drop facts the agent needed.
- Bifrost Code Mode board uses the same Layer2 definition (full MCP text, including TOOL print dumps). Compact `search` + compact execute JSON are ClawQL’s equal-arm surfaces — not harness-only filters.
- Executor arm needs `EXECUTOR_DATA_DIR` (stdio / v1.x) or `EXECUTOR_MCP_URL` (+ optional `EXECUTOR_API_KEY`) for v2 HTTP.
