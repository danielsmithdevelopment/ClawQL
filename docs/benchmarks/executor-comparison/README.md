# Executor.sh comparison (executor-cmp-001)

Side-by-side token comparison against [executor.sh](https://executor.sh/) using **their own homepage chart** as one Layer 1 reference, a **live Executor MCP/CLI install** for re-measurement, and a **GitHub PR list** (GitHub is in their showcase integrations) for Layer 2.

## What is publishable vs not

| Claim | Status | Notes |
| --- | --- | --- |
| Layer 2 live **143,466 vs 907** (~158×) | **Publishable** | Real Executor CLI `pulls.list` vs live ClawQL `execute`+`fields` on `vercel/next.js` |
| Layer 1 ClawQL **394** vs homepage **~1,044** | **OK if labeled** | Marketing chart comparison; homepage prose-heavy `execute` description |
| Layer 1 live MCP `execute`-only **115** | **Must mention** | This install’s `execute` schema is thinner than the homepage sample — ClawQL 394 does **not** “beat” 115 |
| Layer 1 live MCP **all 7 tools = 2,209** | **Context** | Full agent-facing MCP surface on this install |
| ClawQL **883** / **3,548** | **Context only** | Core quartet / standard tier — not the parity headline |
| Fixture **953 vs 23** | **Not for headlines** | Harness sanity only |
| **862×** workflow benchmark | **Do not use here** | Different metric |

**Post sentence for ClawQL Layer 1 variants:**  
*“394 is the fairest apples-to-apples parity comparison to their published single-tool chart number; 883 / 3,548 are ClawQL with more capability on. Separately, a live Executor MCP install measured execute-only at 115 tok and all MCP tools at 2,209 — report both rather than pretending the homepage ~1,044 is the only Layer 1 number.”*

**Post sentence for Layer 2:**  
*“Same task, same repo: Executor’s live `pulls.list` returned 143,466 tokens of raw JSON; ClawQL’s live `execute` with `fields: [title, number]` returned 907. Executor has no output projection today.”*

## Methodology

| Dimension | Executor | ClawQL |
| --- | --- | --- |
| **Layer 1** | Homepage ~1,044 **and** live MCP `tools/list` | Measured gateway `search`+`execute` |
| **Layer 2** | Live CLI tool call (no projection) | Live MCP `execute` + `fields` |
| **862×** | Not comparable | Do not blend |

Tokenizer: `cl100k_base`. `focus=input`.

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

| N | Executor combined | ClawQL combined | Ratio | Exec L2 % of bill |
| -: | ----------------: | --------------: | ----: | ----------------: |
| 1 | 143,581 | 1,301 | **110×** | 99.9% |
| 3 | 431,739 | 3,115 | **139×** | ~100% |
| 5 | 729,915 | 4,929 | **148×** | ~100% |

Layer-2 mean asymptote: **~161×**. Matches the napkin climb toward ~158×.

### B) Mixed list surfaces (5 different endpoints)

File: `executor-cmp-002.multiturn.live.json`

| N | Executor combined | ClawQL combined | Ratio |
| -: | ----------------: | --------------: | ----: |
| 1 | 143,581 | 1,301 | 110× |
| 5 | 327,030 | 4,928 | **66×** |

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

| Layer | Executor | ClawQL | Ratio |
| --- | --- | --- | --- |
| 1 published chart | 1,044 | **394** codemode | 2.65× (chart parity) |
| 1 live MCP execute-only | **115** | 394 | Executor thinner on this install |
| 1 live MCP all tools | **2,209** (7 tools) | 394 / 883 / 3,548 | see notes above |
| 2 live tool result | **143,466** (`pulls.list`) | **907** (`title`+`number`) | **158×** |
| **Combined (L1+L2)** | **144,510** (pub) / **143,581** (live) | **1,301** | **~111×** |
| Executor vs naive dump | 422,266 → 144,510 | | **~2.9×** (internal calibration) |
| ClawQL vs naive dump | 422,266 → 1,301 | | **~325×** (internal calibration) |

Report flags: `publishableAsLive: true`, `executorSdkWired: true`, `source: live_executor_cli+clawql`.

## OpenBench

Task: [`../../openbench/tasks/executor-github-pr-filter/`](../../openbench/tasks/executor-github-pr-filter/)
