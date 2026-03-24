# Reproduce provider token benchmarks

The **README → “Provider benchmark breakdown”** section points here.

## What it measures

| Phase | What | In `latest.json` / summary table | Raw excerpts in `latest.md` |
|-------|------|----------------------------------|-------------------------------|
| **1** | Full `JSON.stringify(openapi)` vs **top-5** `search` payload | ✅ token counts + char totals | **No** — payloads are huge |
| **2 — payloads** | **Full REST response JSON** vs **GraphQL response JSON** (same op + field selection) | ✅ token counts | ✅ **Side-by-side JSON** (fixtures by default) |
| **2 — docs (secondary)** | OpenAPI response **schema** vs **field-selection string** | ✅ under `phase2Documentation` | No |

**Default (no credentials):** Phase 2 uses **representative** request/response pairs in
[`response-examples/`](response-examples/) so you still see **real JSON shape** (full vs lean),
not field names alone.

**Optional live:** `BENCHMARK_LIVE=1` runs the same **REST** and **in-process GraphQL** calls as production; when **both** succeed, live JSON replaces fixtures for that provider.

## Prerequisites

- Repo checkout of ClawQL
- **Bundled provider specs** under `providers/` (default in git).
- For offline runs, the script sets `CLAWQL_BUNDLED_OFFLINE=1` if unset.

## Run (offline — fixtures + full benchmark)

```bash
npm install
npm run benchmark:tokens
```

Outputs:

- `docs/benchmarks/latest.json`
- `docs/benchmarks/latest.md` — Phase 2 side-by-side: **full REST JSON** vs **GraphQL JSON**

## Optional live mode (`BENCHMARK_LIVE=1`)

Live credential/setup instructions are temporarily undocumented while credential strategy is being finalized.
Offline fixture-based benchmarks remain fully reproducible via `npm run benchmark:tokens`.

## CI / regression (optional)

Run `npm run benchmark:tokens` offline and compare `latest.json` to a golden file.

## Multi-provider complex workflow benchmark

This benchmark captures **planning-context savings** for the cross-provider workflow
(Google top50 + Cloudflare + Jira), comparing:

- full loaded spec corpus size
- emitted workflow output size (`multi-provider-test.md`)

Run:

```bash
npm run workflow:multi-provider > multi-provider-test.md 2>&1
```

Results:

- `docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json`
- `docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md`

Notes:

- Uses the same token heuristic as other benchmarks: `approxTokens = ceil(bytes / 4)`.
- This is a **spec corpus vs workflow output** comparison (not REST payload vs GraphQL payload).

## All-providers / complex release-stack workflow

Offline **`search`** across **Google top50 + every other bundled vendor** (merged preset **`CLAWQL_PROVIDER=all-providers`**):

```bash
npm run workflow:complex-release-stack
```

- Writes [`docs/workflow-complex-release-stack-latest.json`](../workflow-complex-release-stack-latest.json) (ranked hits, Jira draft, per-vendor operation counts).
- Guide: [`docs/workflow-complex-release-stack.md`](../workflow-complex-release-stack.md).

Optional Jira POST preview (same pattern as multi-provider):

```bash
WORKFLOW_PREVIEW_JIRA_REQUEST=1 npm run workflow:complex-release-stack
```

Refresh planning-context stats (spec bytes vs workflow JSON):

```bash
npm run report:all-providers-benchmark
```

Writes [`all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json`](all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json). Narrative: [`all-providers-complex-workflow/experiment-all-providers-complex-workflow.md`](all-providers-complex-workflow/experiment-all-providers-complex-workflow.md).
