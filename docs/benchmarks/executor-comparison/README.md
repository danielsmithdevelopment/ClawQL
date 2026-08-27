# Executor.sh comparison (executor-cmp-001)

Side-by-side token comparison against [executor.sh](https://executor.sh/) using **their own homepage chart** as the Layer 1 reference and a **GitHub PR filter task** for Layer 2.

## Methodology (locked before results)

| Dimension | Executor | ClawQL |
| --- | --- | --- |
| **Layer 1** | Published: 1,640 tools → ~278,800 tok naive; 1 `execute` tool → ~1,044 tok codemode | **Measured** via MCP `tools/list` (`cl100k_base`) |
| **Layer 2** | Raw REST JSON enters context (no output projection; trace feature is audit-only, coming soon) | `execute` with `fields` projection |
| **862× claim** | Not comparable — different metric (see below) | Planning-context spec corpus vs workflow artifact |

**Task (executor-cmp-001):** Find open PRs by `{user}` in `{repo}` with more than `{threshold}` review comments; return title + comment count.

**Matched conditions:** same tokenizer (`cl100k_base`), `focus=input`, fixed task params. Model output excluded from headline ratios (same discipline as `/mcp-ui/trace/compare?focus=input`).

## Run

```bash
npm run benchmark:executor-comparison
```

Writes `docs/benchmarks/executor-comparison/executor-cmp-001.json` and prints Layer 1 / Layer 2 splits.

Optional env:

- `CMP_GITHUB_USER`, `CMP_GITHUB_REPO` — task params (defaults: `alice-dev`, `acme/platform`)
- `BENCHMARK_LIVE=1` — reserved for future live GitHub arms (fixtures used today)

## Layer 1 — honest read

Executor's ~1,044 tok number is **input-side tool-definition cost** for their single codemode `execute` tool (search/describe/call workflow baked into the schema).

ClawQL exposes `search` + `execute` (codemode-equivalent) plus non-negotiable `cache` + `audit`. Compare:

- **Codemode-only** (`search` + `execute`) — fairest parity with Executor's one-tool surface
- **Core quartet** — what a default MCP client actually sees before optional plugins

Re-run the script after any tool-schema change; do **not** cite stale numbers.

## Layer 2 — GitHub (Executor showcase integration)

Fixture: [`../response-examples/github-pr-list.json`](../response-examples/github-pr-list.json)

- **Executor arm (simulated):** full GitHub REST list payload — documented behavior, no field trimming
- **ClawQL arm:** projected `{ title, reviewCommentCount }` for PRs matching the task filter

This is the gap Executor does not claim to solve today.

## 862× vs Executor — not the same measurement

The [multi-provider workflow benchmark](../multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md) (~862×) compares:

- **Before:** full Google + Cloudflare + Jira spec corpora on disk (~10.2M tok)
- **After:** emitted workflow JSON (~11.8K tok) for a 14-step real workflow

That is a **full-task planning-context** ratio (input + discovery artifacts + output), **not** Executor's static snapshot of MCP tool-definition bloat for eight integrations.

To ask “is ClawQL input-only already better than Executor?” use **Layer 1 measured numbers** from this script, not the 862× headline.

For per-provider search-step input savings (Phase 1 only), see [`../latest.json`](../latest.json) (`fullSpecTokens` → `top5SearchPayloadTokens`).

## Publishing checklist

1. Run privately; confirm numbers match expectations
2. Report Layer 1 and Layer 2 **separately** — never blend into one ratio without showing the split
3. Label Executor Layer 1 as **published reference**, ClawQL as **measured**
4. Do not conflate “Trace every call” (audit) with output compression

## OpenBench

Task spec: [`../../openbench/tasks/executor-github-pr-filter/`](../../openbench/tasks/executor-github-pr-filter/)

Offline checker validates the JSON report shape when present (for CI wiring later).
