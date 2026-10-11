# Executor.sh comparison (executor-cmp-001)

Side-by-side token comparison against [executor.sh](https://executor.sh/) using **their own homepage chart** as one Layer 1 reference, a **live Executor MCP/CLI install** for re-measurement, and a **GitHub PR list** (GitHub is in their showcase integrations) for Layer 2.

## What is publishable vs not

| Claim                                         | Status                | Notes                                                                                                    |
| --------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| Layer 2 live **143,466 vs 907** (~158×)       | **Publishable**       | Real Executor CLI `pulls.list` vs live ClawQL `execute`+`fields` on `vercel/next.js`                     |
| Layer 1 ClawQL **394** vs homepage **~1,044** | **OK if labeled**     | Marketing chart comparison; homepage prose-heavy `execute` description                                   |
| Layer 1 live MCP `execute`-only **115**       | **Must mention**      | This install’s `execute` schema is thinner than the homepage sample — ClawQL 394 does **not** “beat” 115 |
| Layer 1 live MCP **all 7 tools = 2,209**      | **Context**           | Full agent-facing MCP surface on this install                                                            |
| ClawQL **883** / **3,548**                    | **Context only**      | Core quartet / standard tier — not the parity headline                                                   |
| Fixture **953 vs 23**                         | **Not for headlines** | Harness sanity only                                                                                      |
| **862×** workflow benchmark                   | **Do not use here**   | Different metric                                                                                         |

**Post sentence for ClawQL Layer 1 variants:**  
_“394 is the fairest apples-to-apples parity comparison to their published single-tool chart number; 883 / 3,548 are ClawQL with more capability on. Separately, a live Executor MCP install measured execute-only at 115 tok and all MCP tools at 2,209 — report both rather than pretending the homepage ~1,044 is the only Layer 1 number.”_

**Post sentence for Layer 2:**  
_“Same task, same repo: Executor’s live `pulls.list` returned 143,466 tokens of raw JSON; ClawQL’s live `execute` with `fields: [title, number]` returned 907. Executor has no output projection today.”_

### What 110× does and does not mean

Almost the entire combined ratio is Layer 2 (~158×). ClawQL’s win is **result shaping** (`fields`), not a smaller tool schema — live Executor `execute` is already thinner (115 vs 394). OpenCode-style code mode (and Executor v2) closes that Layer 2 gap by filtering in a program before the result returns to the model. Once that arm exists, expect ~parity near a thousand tokens on their side; remaining difference is Layer 1. Publish that fair arm yourself rather than waiting for the rebuttal.

| Proved today                                                                         | Not proved                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Result shaping dominates tool-definition size                                        | Permanent 110× vs code-mode executors                   |
| ClawQL gets the saving on one structured call (no interpreter, full per-call policy) | That single-call listing is a fair multi-step benchmark |

### Fair comparison (shipped)

| Arm                                     | Meaning                                                                                                 | Script / artifact                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Executor raw                            | Full REST / CLI dump (unfair vs `fields`)                                                               | `executor-cmp-001`                                                         |
| **Executor program-filter (simulated)** | Same fields as ClawQL, projected from the raw payload — stand-in for code-mode filter until Executor v2 | `executor-cmp-001` field `executorProgramFilterSimulated` + **fair suite** |
| ClawQL                                  | `execute` + `fields` (+ `where`)                                                                        | both                                                                       |

```bash
# 12-task suite: single-call, large-list filter, fan-out, cross-source join; input + output tokens
npm run benchmark:executor-comparison:fair
# → docs/benchmarks/executor-comparison/executor-cmp-fair-suite.json
```

On single-source projected tasks, **program-filter ≈ ClawQL (~1×)** — that is the honest post-code-mode picture. The old ~110× / ~158× headline is raw dump vs projection only; keep it labeled as such.

Still TODO when Executor v2 ships: replace the simulated program-filter arm with a **live** Executor program call; regenerate the static compare page (`npm run generate:executor-cmp-static`).

Related product work: declarative `where` on ClawQL `execute` ([ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md)).

## Wall-clock latency (side-by-side)

Token benches above do **not** measure milliseconds. The OTEL span flamegraph **demo** fixture (`demo-mcp-execute`, 120ms) is also synthetic — do not cite it as ClawQL p50.

**Equal arms:** both sides return the **same tiny pets JSON** via one MCP `execute`. Headline = **ClawQL gateway overhead** (`execute − direct fetch`) vs **live Executor execute** (same JSON in-process; Executor sandbox has no `fetch`).

```bash
mkdir -p /tmp/executor-try && cd /tmp/executor-try && npm i executor@latest
cd /path/to/ClawQL
LATENCY_ITERS=100 MOCK_DELAY_MS=0 \
  EXECUTOR_BIN=/tmp/executor-try/node_modules/.bin/executor \
  EXECUTOR_CWD=/tmp/executor-try \
  npm run benchmark:executor-comparison:latency
```

| Arm                      | Role          | What it isolates                             |
| ------------------------ | ------------- | -------------------------------------------- |
| `clawql_execute_equal`   | equal         | MCP execute → tiny same-host mock + `fields` |
| `direct_http_mock`       | control       | Bare `fetch` of the same body                |
| **gateway overhead**     | **equalized** | execute − direct                             |
| `executor_execute_equal` | equal         | MCP execute → same pets JSON in-process      |
| `clawql_audit_append`    | control       | Local ring append                            |

### Latest local run (equal arms, n=100, live Executor v1.6.10)

| Arm                                     |        p50 |        p95 |        p99 |
| --------------------------------------- | ---------: | ---------: | ---------: |
| ClawQL execute e2e                      |     1.8 ms |     2.7 ms |     4.2 ms |
| **ClawQL gateway overhead** (equalized) | **1.3 ms** | **2.1 ms** | **3.4 ms** |
| **Executor execute** (equal JSON)       | **3.0 ms** | **5.5 ms** | **5.9 ms** |
| Direct HTTP mock                        |     0.4 ms |     0.5 ms |     0.8 ms |

ClawQL equalized wins **p50 / p95 / p99** on this host (~**2.3×** faster at p50). Risk gates / hooks / audit remain on the path. Do **not** cite the #1519 50–100ms band as measured.

**How:** microbench pinned uncached OpenAPI→GraphQL schema build at ≈ **5.6 ms** (REST ≈ **0.55 ms**). Default `CLAWQL_OPENAPI_EXECUTE_PATH=auto` prefers **REST** for plain `fields`; nested `{…}` selection still uses Omnigraph with a warm schema cache (~0.01 ms).

**Treat sequential n=100 / sequential n=10k as exploratory only** (not interleaved; ratio inflated). Comparison-page numbers come from the **fair harness** below.

### Fair harness (publishable)

```bash
# Claimable p50/p95/p99 + p999: interleaved, paired, ≥10k/run × 3 runs
EXECUTOR_BIN=… EXECUTOR_CWD=… \
  LATENCY_ITERS=10000 LATENCY_RUNS=3 LATENCY_KEEP_SAMPLES=0 \
  LATENCY_OUT=executor-cmp-latency-fair-10k.json \
  npm run benchmark:executor-comparison:latency-fair

# In-memory WORM arm (not the production durable backend; Panguard off)
LATENCY_GOVERNANCE=1 LATENCY_ITERS=1000 LATENCY_RUNS=3 \
  npm run benchmark:executor-comparison:latency-fair
```

| Critique                         | Response                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Same definition?**          | `gateway_cost = MCP_execute − upstream`. ClawQL: **paired** `execute_i − direct_i`. Executor: upstream **= 0** (same JSON in-process).                    |
| **2. Same machine / transport?** | Both **local stdio**, same host. Report **Executor v1.6.10** (rerun when v2 ships).                                                                       |
| **3. Interleave + spread?**      | Round: ClawQL → Executor → direct. Publish **min…median…max across ≥3 runs**.                                                                             |
| **4. p999 stability?**           | Publish **p50 / p95 / p99** from interleaved multi-run. Claim **p999 only** from interleaved **n≥10,000/run** with multi-run spread (n=2k p999 is noise). |
| **Governance?**                  | `LATENCY_GOVERNANCE=1` = **in-memory WORM** only — not the production durable write path. Always label **Panguard off** unless wired.                     |

#### Publishable results (Executor **v1.6.10**, ClawQL **8.0.0**)

**Lead line (matches harness):**

> On local stdio, with arms interleaved and each call paired against a direct call, ClawQL's risk gates, ring audit, hooks and field projection add **0.88 ms** at p50 and **2.35 ms** at p99 (three-run p50 range **0.86–0.89 ms**, n=10,000/run). p999 across three runs: **5.3–6.2 ms** (median **5.4 ms**). With the **in-memory** audit chain also on (n=1,000, single run — p50/p99 only): **1.7 ms** at p50, **3.2 ms** at p99. **Panguard off.** Executor v1.6.10 on the same harness: about **2.5×** higher at p50. **Hold public claims until remaining board gaps (RAM / Layer-1 schema tokens) close.**

Interleaved closed-loop, **n=10,000/run × 3 runs** (`executor-cmp-latency-fair-10k.json`, post lean-schema + REST-prefer remeasure):

| Arm                              |  p50 (min…med…max) |                p95 |                p99 | p999 (min…med…max) |
| -------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: |
| **ClawQL gateway cost**          | **0.86…0.88…0.89** | **1.41…1.45…1.45** | **2.32…2.35…2.42** |    **5.3…5.4…6.2** |
| **Executor gateway cost**        | **2.17…2.18…2.20** | **3.69…3.72…3.73** | **4.75…4.83…4.85** |    **8.8…9.1…9.9** |
| Direct HTTP mock (primary run)   |               0.27 |               0.42 |               0.51 |               2.53 |
| ClawQL execute e2e (primary run) |               1.13 |               1.78 |               2.71 |               6.58 |

Ratio Exec/Claw p50 across runs: **2.46…2.47…2.57×**.

Earlier n=2,000×3 series (`executor-cmp-latency-fair.json`) — use for p50/p95/p99 cross-check only; **do not claim p999** from it:

| ClawQL gateway    |            p50 |            p95 |            p99 |
| ----------------- | -------------: | -------------: | -------------: |
| 3-run spread (ms) | 1.07…1.10…1.11 | 1.57…1.63…1.68 | 2.54…2.64…2.68 |

**In-memory WORM** (not production durable backend), n=1,000 single run, **Panguard off** (`executor-cmp-latency-fair-governance.json`):

| Arm                                  |     p50 |     p95 |     p99 |
| ------------------------------------ | ------: | ------: | ------: |
| ClawQL gateway cost (in-memory WORM) | 1.73 ms | 2.29 ms | 3.22 ms |
| Executor gateway cost (same run)     | 2.45 ms | 3.85 ms | 5.04 ms |

Do not cite p999 from the in-memory WORM arm until interleaved n≥10k × ≥3 runs.

### Comprehensive board (latency + CPU + RAM + tokens + chaos)

One harness for the multi-dimension comparison:

```bash
EXECUTOR_BIN=… EXECUTOR_CWD=… \
  COMPREHENSIVE_ITERS=500 COMPREHENSIVE_CHAOS_MAX=8 \
  COMPREHENSIVE_CHAOS_SCALEOUT_MAX=32 COMPREHENSIVE_CHAOS_WORKERS=4 \
  COMPREHENSIVE_NATS_SERVER=/path/to/nats-server \
  npm run benchmark:executor-comparison:comprehensive
# → docs/benchmarks/executor-comparison/executor-cmp-comprehensive.json
```

| Dimension | What it measures |
| --- | --- |
| **Latency** | Interleaved equal-arm p50/p95/p99/p999 (paired gateway cost) |
| **CPU / RAM** | `/proc` samples of both MCP server PIDs during latency phase |
| **Tokens** | `cl100k_base` tools/list schemas + equal-arm results + fat-list projection contrast |
| **Chaos (primary)** | **NATS scale-out**: ClawQL K HTTP replicas + queue-group sticky assign vs Executor N stdio processes |
| **Chaos (honesty)** | Stdio process-per-client ramp + single-process HTTP multiplex |

Latest board (`executor-cmp-comprehensive.json`):

<<<<<<< Updated upstream
| Dimension                    |              ClawQL |    Executor | Note                           |
| ---------------------------- | ------------------: | ----------: | ------------------------------ |
| Gateway p50 / p99 (ms)       |     **1.17 / 5.17** | 2.47 / 7.68 | Win (exploratory n=500)        |
| CPU % median                 |                31.7 |        29.8 | Near-parity                    |
| RSS MB median                |                 368 |         253 | Still lose — next lever        |
| `execute` schema tokens      |   **178** (was 323) |          90 | Improved; still lose           |
| Fat lean vs full dump tokens |            **2804** |        9122 | Win (`fields`)                 |
| Stdio chaos sustained        | **8** (was break@8) |           8 | Tie at max tried               |
| HTTP multiplex sustained     |               **8** |         n/a | ClawQL-only shared-process arm |
=======
| Dimension | ClawQL | Executor | Note |
| --- | ---: | ---: | --- |
| Gateway p50 / p99 (ms) | **1.31 / 3.09** | 2.57 / 5.69 | Win (exploratory n=200) |
| CPU % median | 32.9 | 31.6 | Near-parity |
| RSS MB median | 363 | 243 | Still lose — next lever |
| `execute` schema tokens | 178 | 90 | Intentional rich surface — not trimmed for parity |
| Fat lean vs full dump tokens | **2804** | 9122 | Win (`fields`) |
| **NATS scale-out sustained clients** | **32** (4 workers) | **16** (broke @32 p99) | **Win** — primary chaos arm |
| At 32 clients: p99 / rps | **29 ms / 2419** | 153 ms / 291 | ClawQL holds SLO; Executor breaks |
| Stdio process chaos | 8 | 8 | Honesty baseline (tie at max tried) |
>>>>>>> Stashed changes

Honesty: scale-out is the **product** path (fixed gateway replicas, NATS queue-group session placement — same shape as fabric VG workers). Executor comparison uses their natural process-per-client stdio model. Layer-1 schema richness stays. p999 from short comprehensive iters is exploratory — publish latency tails from `latency-fair` 10k×3. **Panguard off**. Hold publicizing until RAM gap is closed or scoped.

**Shareable page:** [clawql.com/benchmarks/executor-comparison/latency.html](https://clawql.com/benchmarks/executor-comparison/latency.html) · `npm run generate:executor-cmp-latency-html`.

The flamegraph demo’s 120ms total remains a **synthetic fixture**. Schema-decode microbench (`scripts/release/measure-gateway-hotpath.mts`) is sub-millisecond and is **not** product latency.

## Methodology

| Dimension   | Executor                                      | ClawQL                                 |
| ----------- | --------------------------------------------- | -------------------------------------- |
| **Layer 1** | Homepage ~1,044 **and** live MCP `tools/list` | Measured gateway `search`+`execute`    |
| **Layer 2** | Live CLI tool call (no projection)            | Live MCP `execute` + `fields`          |
| **Latency** | Live equal-arm via fair harness (interleaved) | paired execute − direct; see FAQ above |
| **862×**    | Not comparable                                | Do not blend                           |

Tokenizer: `cl100k_base`. `focus=input`.

## Flamegraph (side-by-side)

Open **`/mcp-ui/trace/compare/executor`** — served as a **static snapshot** on [clawql.com](https://clawql.com/mcp-ui/trace/compare/executor) and [docs.clawql.com](https://docs.clawql.com/mcp-ui/trace/compare/executor) (no live adapter required). **Link the clawql.com bare URL in blog posts** — it defaults to `focus=input` (model output omitted from ratio).

Regenerate: `npm run generate:executor-cmp-static` from repo root after measurement changes.

- **Left:** ClawQL — L1 394 + L2 907 = **1,301** tok (`vercel/next.js` `pulls/list` with `fields`)
- **Right:** Executor live — L1 **115** (live MCP `execute` only; homepage publishes ~**1,044**) + L2 143,466 = **143,581** tok
- **Combined:** **110×** live L1 · **111×** if you substitute published ~1,044 for L1
- **Layer 2 share:** **100%** of Executor input vs **70%** of ClawQL input (stated on page, not visual-only)
- Page includes L1 caveat: ClawQL 394 vs published Executor ~1,044 vs live execute-only 115

JSON: `/mcp-ui/trace/compare/executor?format=json` · Generic ClawQL compressed-vs-fat: `/mcp-ui/trace/compare`

## Run

```bash
# Fixture only (CI shape)
npm run benchmark:executor-comparison

# Live GitHub + ClawQL (Executor stand-in = raw REST if EXECUTOR_BIN unset)
BENCHMARK_LIVE=1 CMP_GITHUB_REPO=vercel/next.js CMP_PER_PAGE=30 \
  npm run benchmark:executor-comparison

# Live both arms (Executor CLI + ClawQL) — requires local Executor with GitHub connection
BENCHMARK_LIVE=1 CMP_GITHUB_REPO=vercel/next.js CMP_PER_PAGE=30 \
  EXECUTOR_BIN=/path/to/executor \
  EXECUTOR_CWD=/path/to/executor-cwd \
  EXECUTOR_GITHUB_PULLS_PATH=github.user.githubMain.pulls.list \
  npm run benchmark:executor-comparison
```

## Multi-turn compounding (measured, not napkin)

Two live series on `vercel/next.js`. Layer 1 once (Executor live execute-only **115**, ClawQL **394**) + cumulative Layer 2.

### A) Uniform-fat (napkin assumption) — `pulls.list` pages 1..5

File: `executor-cmp-002b.uniform-pulls.live.json`

|   N | Executor combined | ClawQL combined |    Ratio | Exec L2 % of bill |
| --: | ----------------: | --------------: | -------: | ----------------: |
|   1 |           143,581 |           1,301 | **110×** |             99.9% |
|   3 |           431,739 |           3,115 | **139×** |             ~100% |
|   5 |           729,915 |           4,929 | **148×** |             ~100% |

Layer-2 mean asymptote: **~161×**. Matches the napkin climb toward ~158×.

### B) Mixed list surfaces (5 different endpoints)

File: `executor-cmp-002.multiturn.live.json`

|   N | Executor combined | ClawQL combined |   Ratio |
| --: | ----------------: | --------------: | ------: |
|   1 |           143,581 |           1,301 |    110× |
|   5 |           327,030 |           4,928 | **66×** |

Ratio **falls** vs the napkin because later actions (issues/commits/events/releases) are leaner than `pulls.list` — mean Layer-2 ratio ~72×, not 158×. Thesis still holds: Executor’s bill is ~100% uncacheable Layer 2.

**Post guidance:** lead with series A when illustrating compounding; cite series B when showing mixed real workflows. Never publish the napkin alone.

```bash
BENCHMARK_LIVE=1 EXECUTOR_BIN=… EXECUTOR_CWD=… \
  node scripts/benchmarks/executor-comparison-multiturn.mjs

EXECUTOR_BIN=… EXECUTOR_CWD=… \
  node scripts/benchmarks/executor-comparison-uniform-pulls.mjs
```

## Latest private live run (2026-08-27) — single action

Repo: `vercel/next.js`, `per_page=30`.

| Layer                   | Executor                               | ClawQL                     | Ratio                            |
| ----------------------- | -------------------------------------- | -------------------------- | -------------------------------- |
| 1 published chart       | 1,044                                  | **394** codemode           | 2.65× (chart parity)             |
| 1 live MCP execute-only | **115**                                | 394                        | Executor thinner on this install |
| 1 live MCP all tools    | **2,209** (7 tools)                    | 394 / 883 / 3,548          | see notes above                  |
| 2 live tool result      | **143,466** (`pulls.list`)             | **907** (`title`+`number`) | **158×**                         |
| **Combined (L1+L2)**    | **144,510** (pub) / **143,581** (live) | **1,301**                  | **~111×**                        |
| Executor vs naive dump  | 422,266 → 144,510                      |                            | **~2.9×** (internal calibration) |
| ClawQL vs naive dump    | 422,266 → 1,301                        |                            | **~325×** (internal calibration) |

Report flags: `publishableAsLive: true`, `executorSdkWired: true`, `source: live_executor_cli+clawql`.

## OpenBench

Task: [`../../benchmarks/openbench/tasks/executor-github-pr-filter/`](../../benchmarks/openbench/tasks/executor-github-pr-filter/)
