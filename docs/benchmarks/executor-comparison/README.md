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

| Proved today | Not proved |
| --- | --- |
| Result shaping dominates tool-definition size | Permanent 110× vs code-mode executors |
| ClawQL gets the saving on one structured call (no interpreter, full per-call policy) | That single-call listing is a fair multi-step benchmark |

### Next measurements (fair comparison)

1. **Executor program-filter arm** — same task, same fields (`title`+`number`); Executor filters in a program / code mode before return. Publish beside today’s full-REST dump.
2. **Task expansion** — ≥10 tasks, including multi-step fan-out and cross-source joins; measure **outputs** as well as inputs. Single-call `pulls.list` is ClawQL’s best case.
3. **Executor v2 rerun** — once their native code mode ships, regenerate the static compare page (`npm run generate:executor-cmp-static`).

Related product work: declarative `where` on ClawQL `execute` ([ADR 0015](../../adr/0015-program-mode-alongside-search-execute.md)) so filtering does not require programs on our side either.

## Methodology

| Dimension   | Executor                                      | ClawQL                              |
| ----------- | --------------------------------------------- | ----------------------------------- |
| **Layer 1** | Homepage ~1,044 **and** live MCP `tools/list` | Measured gateway `search`+`execute` |
| **Layer 2** | Live CLI tool call (no projection)            | Live MCP `execute` + `fields`       |
| **862×**    | Not comparable                                | Do not blend                        |

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
